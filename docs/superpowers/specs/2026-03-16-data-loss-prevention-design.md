# Data Loss Prevention: Unified Transaction Architecture

## Problem

The z10 editor has two competing write paths that cause data loss:

1. **Browser path**: DOM mutation → serialize content → debounced PUT `/api/projects/:id` → DB
2. **Agent path**: code → POST `/transact` → canonical DOM → patch broadcast → browser replay

When both are active (agent has connected), the PUT path is silently blocked — returning `{ saved: true, skipped: true }` with a 200 status. The browser doesn't check the `skipped` field and believes the save succeeded. If the server crashes or canonical DOM evicts before periodic persist, all browser edits are lost.

Additional issues:
- Client maintains a parallel `content` string via `setContent()` with DOMParser re-parsing, causing race conditions when multiple closures batch
- No `beforeunload` guard — 1.5s debounce window loses edits on tab close
- Fire-and-forget persist on TTL eviction can silently lose data

## Solution: "Always Transact"

Eliminate the PUT auto-save path entirely. ALL writes go through `/transact` against the canonical DOM. The canonical DOM is always loaded when the editor is open. One write path, one source of truth.

### Architecture After

```
Style edits (panel):
  updateElementStyle() → mutate live DOM (instant)
                       → edit bridge batches → POST /transact (fire-and-forget)

Keyboard ops (delete, duplicate, paste, group, reorder):
  handler → mutate live DOM (instant)
          → MutationObserver → generate tx code from MutationRecords
          → batch within microtask → POST /transact (fire-and-forget)

Agent edits:
  POST /transact → canonical DOM → patch broadcast → browser replay
  (unchanged)

Undo/redo:
  restore innerHTML snapshot → generate tx code → POST /transact
  (skip MutationObserver during restore)

Save triggers:
  Cmd+S → POST /flush (triggers server-side persist of canonical DOM)
  beforeunload → navigator.sendBeacon /flush
  No client-side content serialization needed.
```

### Client State Changes

- **`content` string**: No longer a write path. Becomes read-only — set on initial load and server resync only. Used for initial PageContent render.
- **Live DOM in `transformRef`**: The client-side source of truth for all edits.
- **Layer tree**: Derived from live DOM via `refreshLayersFromDOM()`, not from content string.
- **`isExternalUpdate` ref**: Deleted. No dual-path conflict to manage.
- **`updateElementStyle`**: Keeps live DOM mutation + edit bridge dispatch. Removes all `setContent((prev) => { DOMParser... })` calls.
- **`groupIntoFrame`**: Rewritten to mutate live DOM directly instead of parsing content string.

## Detailed Design

### 1. `mutation-to-transaction.ts` (new file)

Pure function: `MutationRecord[] → string` (transaction JS code).

Handles:
- **childList removed**: `root.querySelector('[data-z10-id="X"]').remove()`
- **childList added**: `parent.insertAdjacentHTML('beforeend', '<div ...>')`
- **childList reorder**: `parent.insertBefore(el, refEl)`
- **attribute changed**: `el.setAttribute('attr', 'value')` or `el.style.cssText = '...'`

Skips:
- Style attribute changes (handled by edit bridge, would double-send)
- Mutations during undo/redo restore (handled separately)
- Mutations during patch replay (`undoSuppressRef` guard)

Batching: Multiple MutationRecords from a single user action (e.g., ungroup moves children then removes parent) are collected and combined into one transaction code string.

### 2. `use-mutation-bridge.ts` (replaces `use-auto-save.ts`)

Responsibilities:
- MutationObserver on `transformRef` (same as current)
- Guards: skip if `undoSuppressRef` or `undoRestoringRef` is true
- Collects MutationRecords, converts via `mutationToTransaction()`
- Batches within microtask (same pattern as edit bridge)
- Sends via `transact()` fire-and-forget
- Handles Cmd+S → POST `/flush`
- Handles `beforeunload` → `navigator.sendBeacon('/api/projects/:id/flush')`

### 3. `/api/projects/:id/flush` (new endpoint)

POST handler that triggers immediate `persistCanonicalDOM(projectId)`. Used by:
- Cmd+S
- `beforeunload` via sendBeacon
- Returns `{ persisted: true }` on success

### 4. Changes to `editor-state.tsx`

**Remove from `updateElementStyle`**:
- All `setContent((prev) => { const parser = new DOMParser(); ... })` blocks (~100 lines)
- The function becomes: mutate live DOM + call `onStyleEditRef` callback + bump `styleRevision`

**Rewrite `groupIntoFrame`**:
- Operate on live DOM in `transformRef` instead of parsing content string
- Create frame element, move children, set styles — all via DOM APIs
- MutationObserver catches the mutations and sends transaction

**Remove**:
- `isExternalUpdate` ref and all references
- Content-string-based layer parsing triggers

**Keep**:
- `content` state (read-only, for initial render + resync)
- `updateContent()` (inbound path from server resync)
- `refreshLayersFromDOM()` (becomes the primary layer update path)

### 5. Changes to `use-undo-redo.ts`

Undo/redo currently restores innerHTML and relies on MutationObserver. Change to:
- Set a `undoRestoringRef` flag before restore
- Restore innerHTML (same as now)
- Generate a single transaction: `root.innerHTML = '...'` with the snapshot content
- Send via transact (fire-and-forget)
- Clear flag after microtask settles

### 6. Changes to `canonical-dom.ts`

- `evictStale()`: `await` the persist promise before closing/deleting
- Remove `safeContentWrite()` — no longer needed

### 7. Changes to `route.ts` (project PUT)

- Remove the PUT handler entirely, or keep as a no-op that returns 405

### 8. Save State UI

Replace the current `saveState` ("saved" | "saving" | "unsaved") with a simpler model:
- Server canonical DOM always has the truth after each transaction ack
- Show "synced" by default
- Show "syncing..." when transactions are in-flight
- Show "offline" if transact fails (network error)
- Cmd+S flushes to disk and shows "saved to disk"

## What Gets Deleted

| File/Code | Lines | Reason |
|---|---|---|
| `use-auto-save.ts` | ~170 | Replaced by `use-mutation-bridge.ts` |
| `serializeTransformLayer()` | ~30 | No longer serializing DOM to content string |
| `safeContentWrite()` | ~15 | No PUT path to guard |
| `setContent((prev) => DOMParser...)` blocks in editor-state.tsx | ~100 | Content string no longer write path |
| `isExternalUpdate` ref + all checks | ~20 | No dual-path conflict |
| PUT handler in route.ts | ~30 | No PUT saves |
| `contentRef`, `lastSavedRef`, `saveTimerRef` in auto-save | ~10 | No debounce timer |

**Total removed**: ~375 lines
**Total added**: ~200 lines (mutation-to-transaction + use-mutation-bridge + flush endpoint)

**Net reduction**: ~175 lines while eliminating 6 data loss scenarios.

## Risk Mitigation

- **Transact latency**: Fire-and-forget with optimistic local application. User sees zero latency. Same pattern already proven by edit bridge.
- **Transact failures**: Log warnings (same as edit bridge today). Server canonical DOM may diverge from browser. Next patch from server corrects browser state.
- **Undo coherence**: Undo snapshots are taken from live DOM. Undo restores live DOM and sends transaction. Server canonical DOM stays in sync.
- **Offline editing**: Not supported today, not in scope. Transact failures show "offline" indicator.

## Testing Plan

1. **Style edits persist across refresh**: Edit width in properties panel, refresh, verify width persisted
2. **Keyboard delete persists**: Delete element, refresh, verify element gone
3. **Duplicate persists**: Cmd+D, refresh, verify duplicate exists
4. **Group/ungroup persists**: Group elements, refresh, verify frame exists
5. **Paste persists**: Copy + paste, refresh, verify pasted element
6. **Reorder persists**: Bring forward, refresh, verify order
7. **Agent + user concurrent**: Agent edits while user edits, both persist
8. **Tab close safety**: Edit, close tab immediately, reopen, verify edit persisted (via flush)
9. **Cmd+S flush**: Edit, Cmd+S, kill server, restart, verify edit persisted
10. **Undo/redo sync**: Edit, undo, refresh, verify undo state persisted
