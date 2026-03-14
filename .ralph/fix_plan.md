# Collaborative DOM Editor — Implementation TODOs

Source: `dev/collaborative-dom-editor-design-v3.md`

**Principle: No backwards compatibility. No legacy concerns (pre-production). Minimal, clean, DRY architecture.**

**Current state**: Content stored as full `.z10.html` string in DB. Server has no in-memory DOM. Code execution uses acorn statement-by-statement parsing + VM context. State sync via SHA-256 checksums. Events broadcast full serialized content. Editor canvas uses React state + `updateContent(fullHtml)`. 12 typed MCP write tools + 7 read tools operate on Z10Command model. All of this gets replaced.

**Decisions made:**
- Module location: `src/dom/` (DOM-centric functionality)
- Node identity attr: `data-z10-id` (existing convention)
- Timestamp attrs: `data-z10-ts-*` (existing convention)
- Sandbox: `node:vm` (Node-only, more secure than `new Function`)
- Human edits: generate JS code strings, same execution path as agents (unified). Must work in-browser without network calls for local editing; network only for conveying updates to server.
- No legacy/migration concerns: test with new projects only (pre-production)
- Ring buffer: in-memory only, full resync on crash is acceptable for v1
- Phase 0 (CLI multi-tenancy) folded into Phase B (CLI rebuild) — `--project`/`--page` flags built into new CLI directly

---

## Phase A: Core Engine (no network, no UI — pure logic + tests)

No backwards compat: this is a new `src/dom/` module. Does NOT extend the existing `src/core/` Z10Command model — it replaces it. All functions must be pure and environment-agnostic (no Node.js-only APIs) so they run in happy-dom (server + CLI) AND browser DOM (web UI). Exception: sandbox execution (A7) uses `node:vm` and is Node-only — browser has its own execution path for human edits.

**Naming decided**: `data-z10-id` for node identity, `data-z10-ts-*` for timestamps (matches existing codebase conventions).

### A.1 Primitives

- [x] **A1. Logical clock** — Monotonic Lamport counter. Single integer, incremented per committed transaction. Pure class, no I/O. (§3.2)

- [x] **A2. Timestamp attribute system** — Functions to read/write `data-z10-ts-node`, `data-z10-ts-children`, `data-z10-ts-text`, `data-z10-ts-a-{name}`, `data-z10-ts-a-style-{property}`, `data-z10-ts-tree` on DOM elements. `bubbleTimestamp(node, ts)` with early-stop. `bumpTimestamps(writeSet, ts)` to update all affected timestamps in one pass. (§3.1, §3.3, §3.4)

- [x] **A3. Style string utilities** — `parseStyleString(str)` → `Map<string, string>` and `diffStyleProperties(oldMap, newMap)` → `string[]` of changed property names. Used by both write set builder (A5) and patch serializer (A14). Single implementation, two consumers. (§5.2 Step 8, §6.4)

- [x] **A4. Document bootstrapping** — `bootstrapDocument(root, clock)`: walk all elements in a DOM tree, assign `data-z10-id` to any element that lacks one, set initial `data-z10-ts-*` attributes (all to clock value), bubble `data-z10-ts-tree`. Called once when loading an existing document into the collaborative system for the first time. (§2.2)

### A.2 Transaction Pipeline

- [x] **A5. Write set builder** — `buildWriteSet(mutationRecords)` → array of `{nid, facet, property?, attribute?}`. Facets: structural, children, text, attribute, style-property. Uses A3 style utilities for style attr decomposition. Deduplication. (§5.2 Step 8)

- [x] **A6. Per-facet validator** — `validate(writeSet, manifest, liveDOM)` → conflicts array. Check each write-set entry against live DOM timestamps. No `data-z10-ts-tree` for validation (only for fast pre-check). Returns typed conflict objects per §4.1–4.6. (§5.2 Step 9)

- [x] **A7. Sandbox execution context** — Build the scoped `document` proxy that agent code executes against: `querySelector`, `querySelectorAll`, `getElementById`, `createElement`, `createTextNode` — all bound to the sandbox clone. Code runs as a single block via `node:vm` (`createContext`/`runInContext`). No acorn parsing, no statement splitting, no var rewriting — this replaces the current `src/cli/exec.ts` approach entirely. Node-only (server + CLI). Browser-side human edits generate JS code strings but execute through a separate in-browser path (see D4). (§5.2 Step 4, Step 6)

- [x] **A8. Illegal modification check** — Scan MutationRecords for any change to `data-z10-id` or `data-z10-ts-*` attributes. Reject transaction if found. (§5.2 Step 7)

- [x] **A9. Transaction engine** — Orchestrates the full lifecycle: acquire subtree lock → fast pre-check `data-z10-ts-tree` → clone subtree → attach MutationObserver → prepare sandbox context (A7) → execute code → disconnect observer → check illegal mods (A8) → build write set (A5) → validate (A6) → commit or reject. (§5.1–5.6)

- [x] **A10. Commit procedure** — On validation pass: increment clock, attach live DOM observer, apply changes from sandbox final state to live DOM (attributes, style-properties, text, children via `reconcileChildren`), bump timestamps (A2), bubble `data-z10-ts-tree`, disconnect observer, serialize patch (A14), store in ring buffer (A16). (§5.3)

- [x] **A11. `reconcileChildren(sandboxParent, liveParent, ts)`** — Match children by `data-z10-id`. Existing: reorder/update in place. New (no `data-z10-id`): clone from sandbox, assign fresh `data-z10-id`, set initial `data-z10-ts-*`. Missing (in live but not sandbox): remove. Non-trivial function — needs its own tests. (§5.3)

- [x] **A12. Node ID assignment** — `assignNodeIds(root, idGenerator)`: walk a subtree, assign `data-z10-id` to elements that lack one, set initial `data-z10-ts-*`. Called during commit for newly created nodes (A11) and during bootstrap (A4). Share the logic. (§2.2, §14.1)

- [x] **A13. Subtree locking** — Per-subtree locks with overlap detection (is one root an ancestor of the other?). Non-overlapping = parallel, overlapping = serialized queue. 5s timeout → abort. Document-level lock for administrative ops that blocks all other transactions. (§5.7, §14.7)

### A.3 Patches

- [x] **A14. Patch serialization** — `serializeMutationsToOps(records)` → op array. 5 op types: `attr`, `style`, `text`, `add`, `remove`. Style attr changes decomposed into per-property `style` ops using A3 utilities. Structural ops (`add`, `remove`) preserve MutationObserver ordering. Patch envelope: `{txId, timestamp, ops}`. (§6.1–6.5)

- [x] **A15. Patch replay** — `replayPatch(ops, rootElement)` function. Handles all 5 op types. Nodes addressed by `data-z10-id` via `querySelector`. Must work identically in happy-dom and browser DOM — **this is the single function shared by server, CLI, and web UI**. (§7.3)

- [x] **A16. Patch ring buffer** — Ordered log of committed patches keyed by `txId`. Configurable capacity (default 1000). Lookup by range: `getPatches(afterTxId)` → array. (§5.1, §7.4)

### A.4 Stripping + Cross-Context Verification

- [x] **A17. Metadata stripping** — Two functions: (1) `stripForAgent(root)` — clone, remove `data-z10-ts-*`, retain `data-z10-id`. For proxy/CLI serving agent reads. (2) `stripForExport(root)` — clone, remove both `data-z10-id` and `data-z10-ts-*`. For export, copy, publish. Both run on clones, never on live DOM. (§8.3, §11)

- [x] **A18. Cross-context verification test** — Write a test that runs `replayPatch` and the transaction engine against both happy-dom and browser DOM (jsdom or happy-dom browser compat mode) to confirm identical behavior. Surface any API divergence (e.g., `MutationObserver` differences, `cloneNode` behavior, `style` attribute handling) before Phases B–D build on this assumption. This is a key architectural invariant: one module, three consumers.

---

## Phase B: CLI as Local Proxy (the CLI *is* the proxy/sidecar)

No backwards compat: delete `src/cli/checksum.ts`, gut `src/cli/exec.ts` (remove acorn parsing, statement splitting, var rewriting), gut `src/cli/dom.ts` (remove checksum-based state sync). The CLI becomes a thin wrapper around the shared core engine from Phase A.

- [x] **B1. CLI DOM replica** — Long-lived happy-dom instance in the CLI process holding full document copy with all `data-z10-id` and `data-z10-ts-*`. Kept in sync via patch stream. Uses `replayPatch` (A15). Replaces `src/cli/dom.ts`. (§8.1)

- [x] **B2. Read tickets + getSubtree** — `getSubtree(selector, depth?)` → `{html, ticketId}`. Uses `stripForAgent` (A17). Ticket stores manifest: snapshot of all `data-z10-ts-*` timestamps for every node in the returned subtree. `depth` parameter limits traversal for large documents. Single-use tickets, 60s TTL, garbage collected. (§8.2, §8.4, §8.8)

- [x] **B3. Local validation + submitCode** — On `submitCode(code, ticketId)`: look up ticket manifest → run transaction engine (A9) against LOCAL DOM → reject locally (free, no network) or forward `{code, manifest, subtreeRootNid}` to server. On local reject: serve fresh HTML from local DOM + new ticket. (§8.5)

- [x] **B4. refreshSubtree** — `refreshSubtree(ticketId)` → `{changed, html?, newTicketId?}`. Checks if the subtree has changed since the ticket was issued by comparing `data-z10-ts-tree` on the subtree root. If changed, returns fresh stripped HTML + new ticket. If unchanged, returns `{changed: false}`. (§8.2)

- [x] **B5. CLI SSE patch consumer** — Connect to server SSE stream. Replay patches against CLI's local DOM via `replayPatch` (A15). Track `lastSeenTxId`. Handle reconnection: send `lastSeenTxId`, receive missed patches or full resync. (§7.4, §8.1)

- [x] **B6. CLI startup + resync** — On first operation for a project: fetch full document + current `txId` from server (C4), bootstrap into happy-dom (A4 if needed), subscribe to patch stream. On gap too large: full resync discards local DOM, rebuilds from server. (§7.4, §7.5, §14.6)

- [x] **B7. `--project` and `--page` flags** — Build into the new CLI directly (not retrofitted onto old CLI). Commands `dom`, `exec`, `page list`, `components`, `tokens` accept `--project <id>` and `--page <id>`. Shared `resolveProjectId(args, session)` / `resolvePageId(args, session)` helper. Session-based `load` commands remain as convenience aliases only. Update Skill file & agent docs.

- [x] **B8. Delete obsolete CLI code** — Remove: `src/cli/checksum.ts` (replaced by tickets), acorn statement parsing from `src/cli/exec.ts` (replaced by single-block execution via A7), `computeChecksum`/`domChecksum` from session, `STALE_DOM` error handling. The new exec flow: read stdin → `submitCode(code, ticketId)` → print result. *Deleted checksum.ts. Removed rewriteDeclarations, runExecOffline from exec.ts. Rewrote cmdExec to use getProjectConnection + submitCode. Kept parseStatements/createExecEnvironment/executeStatement/summarizeStatement temporarily for MCP tools (Phase E). Stubbed computeChecksum in mcp/tools.ts. Removed domChecksum from session.ts. Cleaned up dom.ts and commands.ts. 546 tests passing, 0 failures.*

---

## Phase C: Server API + Broadcast

No backwards compat: the current `/api/projects/:id/exec` endpoint (statement-by-statement streaming NDJSON) and `/api/projects/:id/dom` endpoint (full HTML + checksum) get replaced. The current `ProjectEventBus` (full-content broadcast) gets replaced by patch broadcast.

- [x] **C1. Server canonical DOM** — On project open, load content from DB into a happy-dom instance. This is the canonical DOM. Run `bootstrapDocument` (A4) if the document lacks `data-z10-id`/`data-z10-ts-*` (first-time migration). Server holds one happy-dom instance per active project. (§5.1)

- [x] **C2. Server transaction endpoint** — New endpoint: `POST /api/projects/:id/transact`. Accepts `{code, manifest, subtreeRootNid}`. Runs transaction engine (A9) against canonical DOM. Returns `{status: 'committed', timestamp, patch}` or `{status: 'rejected', conflicts, freshHtml}`. Replaces current `/api/projects/:id/exec`. (§5.2, §5.4)

- [x] **C3. Patch broadcast** — On each commit, broadcast patch envelope to all connected clients. Server→CLI: SSE (reuse/replace existing `events` endpoint). Server→WebUI: WebSocket. Same patch format for both. Replaces current `ProjectEventBus` that sends full serialized content. (§7.1, §7.2)

- [x] **C4. Initial sync endpoint** — `GET /api/projects/:id/sync` → full serialized document (outerHTML with all `data-z10-id` + `data-z10-ts-*`) + current `txId`. New clients bootstrap from this, then subscribe to patch stream. Replaces current `/api/projects/:id/dom` (which returns stripped HTML + checksum). (§7.5)

- [x] **C5. Reconnection protocol** — SSE/WebSocket reconnection: client sends `lastSeenTxId`. Server replays from ring buffer (A16). If gap exceeds buffer: send full document (same as C4). (§7.4)

- [x] **C6. Canonical DOM persistence** — Persist canonical DOM back to DB (`projects.content` column). Options: on interval, on idle, on shutdown, on N commits. Ring buffer persistence for crash recovery. Serialization: `outerHTML` of canonical DOM (includes all metadata). (§F3 from previous)

- [x] **C7. Delete obsolete server code** — Remove: `/api/projects/:id/exec` (statement streaming), `/api/projects/:id/dom` (checksum-based), `ProjectEventBus` and `project-events.ts` (full-content events), `classifyTool`/`extractAffectedIds` event classification. The MCP write tool handlers that call `executeCommand` are obsolete — see E4. *Note: Deleted exec, dom, events endpoints. Kept project-events.ts temporarily since MCP routes (E4) and use-agent-stream (D6) still import from it.*

---

## Phase D: Human Editor Integration

No backwards compat: the editor canvas currently receives full content via `updateContent(html)` from the SSE `useAgentStream` hook. This entire flow gets replaced. The canvas becomes a live DOM that receives patches, not a React-state-driven rendering of serialized HTML.

- [x] **D1. WebSocket connection** — Editor page opens WebSocket to server on mount. Receives patch envelopes in real time. Replaces current `useAgentStream` SSE hook that receives full content. (§7.1, §10.1) *Implemented as SSE via existing /patches endpoint (same protocol as CLI B5). Created `usePatchStream` React hook with EventSource, exponential backoff reconnection with jitter, lastSeenTxId tracking for gap replay. Wired into editor-shell.tsx alongside legacy useAgentStream (kept for activity panel/highlights until D6). Uses cookie-based session auth (authenticateMcp already supports it). WebSocket upgrade deferred to D4 when bidirectional communication is needed for human edit → server flow. 555 tests passing.*

- [x] **D2. Browser patch replay** — On receiving a patch, call `replayPatch(ops, canvasRoot)` (A15) against the actual browser DOM inside the canvas iframe/container. Agent edits appear live — individual elements update, not full re-render. (§10.1) *Created `useCanvasPatchReplay` hook that calls replayPatch(patch.ops, transformRef.current) for patches and updateContent(html) for resyncs. Wired into editor-shell.tsx via usePatchStream callbacks. Full D1→D2 flow: SSE event → usePatchStream → handlePatch → replayPatch → live DOM update. 564 tests passing.*

- [x] **D3. Canvas architecture change** — The editor canvas currently works as: server → full HTML string → React state → iframe srcdoc/innerHTML. New architecture: server → initial sync (full HTML) → live DOM in iframe → patches applied directly to that DOM. The canvas iframe holds the live document. The React layer reads from this DOM for selection, properties panel, layers tree — but does not own the document state. (§10.1, §10.5) *Changed PageContent from dangerouslySetInnerHTML to ref-based initialization (innerHTML set once on mount, patches mutate DOM directly). Added refreshLayersFromDOM to EditorState — reads live DOM [data-z10-page] element and re-derives layer tree for active page. Wired into useCanvasPatchReplay so layers panel auto-refreshes after each patch. Updated handleResync to replace DOM directly via innerHTML instead of React state re-render. Auto-save MutationObserver already catches DOM mutations from patches. 568 tests passing.*

- [x] **D4. Human edit → server flow** — When human edits via properties panel, drag, text editing: generate JS code string (same format agents use), apply optimistically to local browser DOM (direct execution, no network), then send code to server via WebSocket. Server runs it through the transaction engine (same path as agent edits), broadcasts resulting patch to all clients. Human's canvas already applied it locally; incoming patch is a no-op or reconciliation. This unifies all DOM edits to the same code execution path. (§10.2) *Created `generate-edit-code.ts` with 6 code generators (style, attr, text, remove, add, reparent) using `document.querySelector('[data-z10-id="..."]')` pattern. Created `useTransact` hook that POSTs to `/transact` with `manifest: null` (trusted browser mode — server builds fresh manifest). Created `useEditBridge` hook that registers on EditorState's `setOnStyleEdit` callback, batches style changes per element per microtask, generates JS code via `generateStyleCode`, sends via transact. Modified transact endpoint to accept optional manifest. Added `isOwnTx` self-dedup in `usePatchStream` to skip patches the browser originated. 14 new tests for code generation, 582 tests passing.*

- [x] **D5. Human-agent conflict handling** — Human commits first → agent's CLI validation fails, agent retries. Agent commits first → human editor replays patch, canvas updates. No silent merges. The properties panel must handle values changing under it (e.g., user is editing font-size, agent changes it — show updated value). (§10.3) *Added `validateSelection` to EditorState — after each patch replay, checks if selected element IDs still exist in live DOM and clears stale ones (handles agent removing selected elements). Wired into `useCanvasPatchReplay` for both patch and resync flows. Expanded properties panel MutationObserver from `style`-only to all attributes + characterData + subtree, so agent patches to any property are reflected immediately. Added rejection handling in `useEditBridge` — logs warnings on transaction rejection/error (server truth arrives via patch replay, MutationObserver auto-refreshes panel). 12 new tests for conflict scenarios, 594 tests passing.*

- [x] **D6. Delete obsolete web UI code** — Remove: `useAgentStream` hook (full-content SSE), `updateContent` calls, `ProjectEventBus` subscription in canvas, the `content-updated` event type. The editor-canvas no longer receives serialized HTML strings — it receives patches. *Deleted `use-agent-stream.ts`, `use-agent-highlight.ts`, `agent-activity-panel.tsx`. Removed `ProjectEventBus` class and `content-updated` event type from `project-events.ts` (kept `classifyTool`/`extractAffectedIds` helpers). Removed `projectEvents.emit()` calls from both MCP route handlers. Cleaned up `editor-shell.tsx` (removed 3 imports, legacy hook calls, AgentActivityPanel JSX). Updated `connect-agent-button.tsx` to use `PatchConnectionState` instead of `AgentConnectionState`. Removed agent highlight CSS keyframes from `globals.css`. 594 tests passing.*

---

## Phase E: Agent Interface Updates

No backwards compat: the current MCP write tools (12 commands mapping to Z10Command) and the `z10_exec` MCP tool (statement-by-statement) get replaced by `submitCode` + `getSubtree`. The agent interface simplifies dramatically.

- [x] **E1. Update agent system prompt / Skill file** — Rewrote `z10.skill.md`: removed all references to statement-by-statement execution, checksum sync, STALE_DOM, acorn parsing, Z10Command model. Added: atomic single-block execution, sandboxed scoped `document`, transaction/conflict model, restricted attributes (data-z10-id read-only, data-z10-ts-* do-not-touch), txId output, illegal modification errors. Updated `.ralph/AGENT.md` architecture section to reflect `src/dom/` replacing `src/core/`. 21 tests validate skill file accuracy (`tests/cli/skill-file.test.ts`).

- [x] **E2. Retry with backoff** — Added `submitWithRetry()` to `src/cli/exec.ts`: on conflict rejection, uses fresh `newTicketId` from rejection result, waits with exponential backoff + jitter (`min(baseDelay * 2^attempt + random(0, jitter), maxDelay)`), retries up to 5 attempts. Non-conflict rejections (code errors) are not retried. Also fixed `result.freshHtml` → `result.html` bug in cmdExec. 10 tests (`tests/cli/retry.test.ts`).

- [x] **E3. New `z10 exec` flow** — Cleaned up `src/cli/exec.ts`: removed all legacy functions (`parseStatements`, `createExecEnvironment`, `executeStatement`, `summarizeStatement`) and their `acorn`/`happy-dom`/`node:vm` imports. Moved legacy functions to `src/cli/legacy-exec.ts` for MCP tool compatibility until E4. Enhanced `cmdExec` output: on commit prints updated HTML, on reject prints error details + fresh HTML. Updated MCP tools import to use `legacy-exec.ts`. Updated `tests/cli/exec.test.ts` import path.

- [x] **E4. MCP tool migration** — Replaced 12 write tools + `z10_exec` with 3 DOM tools (`submit_code`, `get_subtree`, `refresh_subtree`) in `src/mcp/tools.ts`. Added `handleDomTool()` async handler proxying to `LocalProxy`. Updated `src/mcp/server.ts` with `LocalProxy` state (`getProxy`/`setProxy`), DOM_TOOLS registration, and auto-save sync after successful `submit_code`. Updated `src/mcp/index.ts` exports. Deleted `src/cli/legacy-exec.ts` and `tests/cli/exec.test.ts` (dead code — MCP tools no longer import legacy functions). Deleted `tests/mcp/z10-exec.test.ts`. Rewrote `tests/mcp/tools.test.ts` with 9 DOM tool tests replacing 13 write tool tests. Updated `get_guide` to describe new 3-tool workflow. 592 tests passing.

- [x] **E5. Delete obsolete core model** — Deleted `src/core/commands.ts` (Z10Command executor, 345 lines) and `tests/core/commands.test.ts` (21 tests). Removed all command type definitions from `src/core/types.ts` (NodeCommand, TextCommand, InstanceCommand, RepeatCommand, StyleCommand, MoveCommand, RemoveCommand, ComponentCommand, TokensCommand, BatchCommand, AttrCommand, WriteHtmlCommand, PageCommand, Z10Command union, CommandResult, CommandSuccess, CommandError, BatchResult — 132 lines). Removed `export * from './commands.js'` from `src/core/index.ts`. Kept: `types.ts` (Z10Document, Z10Node, and supporting types — still used by MCP read tools, format parser/serializer, exporters), `document.ts` (document manipulation functions), `config.ts`. 571 tests passing.

- [x] **E6. Migrate export system** — `src/export/` (React, Vue, Svelte exporters) currently operates on `Z10Document` / `Z10Node` types from `src/core/`. These types are deleted in E5. Rewrite exporters to work against DOM (happy-dom tree) instead. Input: DOM root element. Output: framework-specific code. Use `stripForExport` (A17) to get clean HTML, then transform.

---

## Phase F: Security + Polish

- [x] **F1. Sandbox hardening** — Hardened `src/dom/sandbox.ts`: blocked all dangerous globals (globalThis, window, process, require, fetch, setTimeout, setInterval, WebSocket, XMLHttpRequest, etc. — all set to `undefined`). Froze built-in prototypes (Object, Array, String, Number, Boolean, Function, RegExp, Date, Error, Map, Set) inside VM context via `runInContext` init script. Whitelisted safe globals (JSON, Math, parseInt, etc.). CPU timeout already enforced (5s default). Added 17 tests in `tests/dom/sandbox.test.ts`. 588 tests passing. (§12.1)

- [x] **F2. Rate limiting** — Token bucket rate limiter in `src/dom/rate-limit.ts`. `RateLimiter` class with configurable maxTokens and refillRate. `ConnectionRateLimiter` provides per-connection read (100/s) and write (20/s) limits. Exported from `src/dom/index.ts`. 11 tests in `tests/dom/rate-limit.test.ts`. 599 tests passing. (§12.3)

---

## Design Doc Section Coverage Checklist

| Design Section | TODO(s) | Notes |
|---|---|---|
| §1 Problem Statement / Constraints | — | Architectural context, not actionable |
| §1.2 System Topology | All phases | CLI=proxy, server=authority, webUI=replica |
| §2 Element Identity | A4, A12, A8 | Bootstrap, assignment, immutability check |
| §3 Version Tracking | A1, A2 | Clock, timestamps, bubble-up |
| §4 Conflict Taxonomy | A6 | Per-facet conflict types |
| §5 Transaction Engine | A5–A13 | Full pipeline |
| §5.3 reconcileChildren | A11 | Called out separately — non-trivial |
| §5.7 Subtree Locking | A13 | Includes doc-level lock (§14.7) |
| §6 Patch Format | A3, A14 | Style utilities shared with write set |
| §7 Broadcast + Sync | A15, A16, C3–C5 | Replay, ring buffer, reconnection |
| §8 Local Proxy | B1–B8 | CLI is the proxy, includes multi-tenancy flags |
| §9 Agent Interface | E1–E6 | System prompt, retry, exec flow, MCP, exports |
| §10 Human Editor | D1–D6 | Canvas rewrite, WebSocket, conflicts |
| §11 Metadata Stripping | A17 | Two variants: agent vs export |
| §12 Security | F1, F2 | Sandbox, rate limiting |
| §13 Performance | — | Informational, validates design |
| §14 Edge Cases | A11, A13, B5–B6, E2 | Node creation, doc lock, crash, retry |
| §15 Constraint Verification | — | Validation matrix, not actionable |
| §16 Future Extensions | — | Intentionally deferred |

## Key Architectural Invariants

- **One `replayPatch`, three consumers**: Server (happy-dom), CLI (happy-dom), web UI (browser DOM). Same function, same behavior. Verified by A18.
- **One transaction engine, two runners**: Server runs it against canonical DOM. CLI runs it against local replica for local validation. Same code path. (§8.7)
- **CLI is the proxy**: The design's "local proxy / agent sidecar" = the `z10` CLI.
- **No JS parsing**: Code executes as a single block. Acorn parsing is deleted.
- **Unified edit path**: All DOM edits (agent and human) are JS code strings executed through the same transaction engine. Human edits generate JS, apply optimistically in-browser, then send to server.
- **Sandbox: `node:vm`**: Server + CLI use `node:vm` for secure sandbox execution. Browser-side human edits execute directly (trusted code generated by the editor itself).
- **No CRDT for v1**: Server-authoritative with optimistic local validation. CRDT only for future human-to-human character-level collab. (§10.4)
- **innerHTML support**: Falls out of MutationObserver capturing childList mutations. No special handling. (§5.5)
- **Wholesale style vs property-level**: `setAttribute('style', ...)` touches all style-property timestamps. Correct conservative behavior. (§14.8)

---

# Zero-10 — Road to Launch

Goal: launchable SaaS with monetization, targeting AI-native builders.
Items ordered by dependency — each phase builds on the previous.


---

## Ready to launch
- [x] Deploy to production — CI/CD pipeline (GitHub Actions CI + CD workflows), Dockerfile for self-hosted, Vercel deploy config. **Human action needed**: set up Vercel project, configure secrets (VERCEL_TOKEN, DATABASE_URL, AUTH_SECRET), domain + SSL

---

## Post-Launch: Branching + Visual Diff (PRD Pillar 1)
_The branchable evolution story — powerful differentiator, not required for day-1._

- [ ] Branch switcher dropdown in editor top bar (PRD 1.3). **Clone from Figma:** Figma's branching dropdown in the toolbar — branch name shown, click to switch, "Create branch" option. Difference: backed by real Git branches, not Figma's proprietary branching
- [ ] "Branch" button creates Git branch from editor (PRD 1.3)
- [ ] Visual diff between branches/commits — side-by-side rendering, overlay mode (red/green/amber), property diff panel, semantic diff grouping (PRD 1.2). **No Figma equivalent** — this is a Zero-10 original
- [ ] "Merge" button with visual conflict resolution (PRD 1.3). **Partial Figma clone:** Figma's branch merge review UI — shows changes side-by-side with accept/reject. Difference: conflict resolution is per-node using data-z10-id matching, not per-page
- [ ] Timeline scrubber — slider through Git history, live canvas update per commit (PRD 1.4)
- [ ] `z10 diff --visual` — open visual diff in editor from CLI (PRD 1.3)
- [ ] GitHub Action / CI integration — auto-render visual diffs on PRs that modify .z10.html files (PRD 1.5)

## Post-Launch: Reconciliation + Collaboration (PRD Pillar 3)
_Design-stays-in-the-loop — the long-term moat._

- [ ] Full reconciliation pipeline Steps 1-8 — AST parse, DOM normalize, node match, property diff, classify, screenshot verify, patch generate, review (PRD 3.3)
- [ ] Node identity resilience — 5-tier matching: exact ID → structural+content → component signature → visual region → no match (PRD 3.5)
- [ ] Sync panel UI — Design Changes (auto-applicable), Code Regions (informational), Needs Review (ambiguous with thumbnails) (PRD 3.6)
- [ ] Agent governance Level 2 — propose & approve: agent writes to staging branch, accept/reject per change (PRD 2.4)
- [ ] Collaborative editing via CRDT (PRD Phase 3)

## Post-Launch: Growth Features
- [ ] Scoped API keys — per-project key scoping, read-only vs full-access permissions, key rotation workflow. Aligns with MCP ecosystem direction (Slack/Figma/GitHub all use OAuth with scoped permissions); scoped keys give similar least-privilege benefits without OAuth complexity
- [ ] `get_screenshot` MCP read tool — visual capture via headless browser (PRD 2.10)
- [ ] Figma file import (~85% fidelity) (PRD Phase 4)
- [ ] Dynamic data — `data-z10-datasource` attribute for live API connections (PRD 6.3)
- [ ] WebGPU canvas upgrade — replace DOM-based canvas with WebGPU Tier 1 + DOM island Tier 2 crossfade (PRD 5.2)
- [ ] Advanced editor tools. **Clone from Figma:** Rectangle (R), Ellipse (O), Line (L), Pen (P) tools; smart guides (magenta alignment lines that appear when dragging near edges/centers of siblings); snap to pixel grid; rulers along top and left edges with draggable guides; boolean operations (Union, Subtract, Intersect, Exclude) for shapes
- [ ] Team features. **Clone from Figma:** invite via email, Viewer/Editor roles, shared project dashboard with recent files, avatar cursors for real-time collaboration (post-CRDT)

---

## Completed
- [x] Project initialization
- [x] Set up basic project structure and build system (TypeScript + Vitest)
- [x] Define core data structures and types (Z10Document, Z10Node, Z10Command, etc.)
- [x] Implement core business logic (Document model + 12 command executors)
- [x] Create test framework and initial tests (106 tests across 5 files, all passing)
- [x] Add error handling and validation (deterministic error codes per PRD spec)
- [x] Implement .z10.html file parser (17 tests)
- [x] Implement .z10.html file serializer (13 tests)
- [x] Fixed type error in batch command executor (CommandResult union narrowing)
- [x] Implement MCP server with read tools (7 tools, 27 tests)
- [x] Implement MCP server write tools (12 tools via command executor)
- [x] MCP HTTP server with Streamable HTTP transport on port 29910
- [x] Implement CLI tool entry point (z10 serve, z10 new, z10 info)
- [x] Implement CLI Git commands (z10 branch, z10 diff, z10 merge, z10 sync) with semantic node-level diffing
- [x] Add Z10 runtime (faker, template instantiation, mode switching) — 66 tests
- [x] Add configuration management (validation, CLI get/set, config file support) — 24 tests
- [x] Create user documentation (comprehensive README with CLI, MCP, format, runtime docs)
- [x] Implement export_react (React + Tailwind export) — MCP utility tool, CLI command, 20 tests
- [x] Implement export_vue (Vue 3 SFC export) — MCP utility tool, CLI --format vue, 19 tests
- [x] Implement export_svelte (Svelte export) — MCP utility tool, CLI --format svelte, 16 tests
- [x] Implement find_placement MCP utility tool — layout-aware placement suggestions, 8 tests
- [x] Implement reconcile MCP utility tool — document consistency analysis, 6 tests

## Phase 1: Web App Foundation
_Nothing else works without auth, projects, and hosting._

- [x] Choose stack and scaffold web app — Next.js 15 + App Router + Tailwind CSS v4 + TypeScript in web/ directory. Routes: / (landing), /login (OAuth buttons), /dashboard (project list), /editor/[projectId] (3-pane editor shell), /api/projects (REST stub)
- [x] Auth — Auth.js (next-auth v5) with GitHub + Google OAuth providers. Middleware protects /dashboard and /editor routes. Server-side session in dashboard shows user avatar + sign out. Login page uses server actions for sign-in flow.
- [x] Database schema — Drizzle ORM + Postgres. Tables: user, account, session, verificationToken (Auth.js), team (name, slug, owner), team_member (role enum: owner/admin/editor/viewer), project (name, slug, owner, team, content as text, thumbnail, isPublic). Migration generated. Auth.js wired to Drizzle adapter with JWT strategy.
- [x] Project CRUD — Server actions (create, list, rename, delete, duplicate) in lib/actions.ts. Dashboard with responsive project card grid (thumbnail, name, time-ago), search with URL params, create project dialog, context menu (rename inline, duplicate, delete with confirm). REST API at /api/projects (GET/POST) with auth. Default .z10.html template with primitives tokens on project creation.
- [x] Server-side file storage — Content stored as text in Postgres projects table (MVP). REST API: GET /api/projects/[id] (load), PUT /api/projects/[id] (save content), DELETE /api/projects/[id]. Editor loads project from DB server-side, renders .z10.html in sandboxed iframe. Auto-save with 1.5s debounce via postMessage + Cmd+S. Save state indicator (Saved/Saving/Unsaved).

## Phase 2: Editor MVP
_The product — users need to see and edit their designs in the browser._

- [x] Canvas rendering — DOM-based infinite canvas. Parses .z10.html pages (data-z10-page elements) into positioned artboards. Pan via scroll, middle-drag, or Space+drag. Zoom via Cmd+scroll / pinch-to-zoom, centered on cursor. Zoom controls (−/+/Fit/percentage) in bottom-right. Keyboard: Shift+1 zoom to fit, Cmd+0 zoom to 100%. Auto zoom-to-fit on load. CSS transform with will-change for performance.
- [x] Left pane: Layers panel. Recursive tree view parsing data-z10-* elements. Expand/collapse arrows, click-to-select (Shift for multi), eye icon visibility toggle, lock icon, search/filter at top. Node types: page (📄), frame (▢), text (T), component (◇), element (•). Shared EditorProvider context for selection/visibility/lock state across layers+canvas. EditorShell wrapper for client-side state management.
- [x] Right pane: Properties panel. **Clone from Figma:** right sidebar "Design" tab — sections for Alignment (row of 6 align buttons + distribute), Auto Layout (direction, gap, padding, with Figma's compact row layout), Frame (W/H with constrain proportions lock, X/Y position, rotation, corner radius with independent corners toggle), Fill (color swatch + opacity, click to open color picker, + button for multiple fills), Stroke (color, weight, dash, position inside/center/outside), Effects (drop shadow, inner shadow, blur — each with toggle + expand for params), Typography (font family dropdown, weight, size, line height, letter spacing, paragraph spacing, alignment). Difference: values are real CSS properties, token-bound values show pill with token name (click to detach)
- [x] Color picker. **Clone from Figma:** saturation/brightness square + hue strip + opacity strip, hex input, RGB inputs, eyedropper tool, recent colors row, document colors section
- [x] Basic interactions. **Clone from Figma:** click to select (blue selection outline + 8 resize handles), drag to move (with distance tooltip), handles to resize (hold Shift to constrain proportions, hold Alt to resize from center), marquee/box select (drag on empty canvas), Shift+click for multi-select, double-click to enter frame/group, click outside or Esc to exit
- [x] Selection overlay. **Clone from Figma:** blue bounding box (#0D99FF) around selected element, 8 square resize handles (corners + edge midpoints), blue distance lines on hover showing spacing to nearby elements, selection dimensions label (W × H) near top-right handle
- [x] Tools toolbar. **Clone from Figma:** vertical toolbar on left edge — Move/Select (V), Frame (F), Text (T), Hand (H), zoom controls. Each tool icon with single-key shortcut shown on hover tooltip
- [x] Page tabs. **Clone from Figma:** horizontal page tabs at top of layers panel, + button to add page, right-click to rename/duplicate/delete, drag to reorder
- [x] Keyboard shortcuts. **Clone from Figma:** V select, F frame, T text, H hand, Cmd+Z undo, Cmd+Shift+Z redo, Cmd+D duplicate, Cmd+C/V copy-paste, Cmd+G group, Cmd+Shift+G ungroup, Delete/Backspace to remove, Cmd+] bring forward, Cmd+[ send backward, Cmd+A select all, Cmd+0 zoom to 100%, Shift+1 zoom to fit
- [x] Save — persist edits back to server-side .z10.html (auto-save on change with debounce, like Figma's automatic saving)
- [x] Undo/redo stack — in-memory command history. **Clone from Figma:** unlimited undo depth within session, undo applies to the last discrete operation (not per-keystroke in text editing)

## Phase 3: Agent Integration (the differentiator)
_AI agents connect and edit designs in real time — this is why users pick Zero-10 over Figma._

- [x] Server-side MCP server per project — MCP endpoint scoped to a specific project's .z10.html
- [x] MCP project targeting — use MCP elicitation to prompt agent for project selection if not specified
- [x] Real-time streaming to browser — as agent sends MCP commands, push changes to editor via WebSocket/SSE; canvas updates incrementally
- [x] MCP streaming execution — execute commands as they are parsed from agent stream, not after full response (PRD 2.7)
- [x] Agent connection UI — "Connect Agent" button in editor toolbar, connection instructions per client (Claude Code, Cursor, etc.), live green dot indicator (PRD 2.3)
- [x] Agent edit highlighting — blue pulse on created (1.5s), property flash on modified, red flash + fade-out on removed (300ms), parent context tint (PRD 2.9)
- [x] Agent Activity panel — real-time operation log with per-operation undo (PRD 2.9)
- [x] `get_guide` MCP read tool — contextual help/onboarding for agents (PRD 2.10)

## Phase 4: Core Library Completions
_Fill gaps in the command/tool set that agents and the editor need._

- [x] `z10.attr` command — set data attributes and HTML attributes (PRD 2.12, command #11)
- [x] Batch `upsert` mode — create-or-update semantics for `z10.batch` (PRD 2.11)
- [x] Agent governance Level 3: scoped edit — respect `data-z10-agent-editable`, MCP server rejects unauthorized edits (PRD 2.4)
- [x] Security model — CSP headers on preview/editor, runtime hash validation, strip external references (PRD 4.5)

## Phase 5: Monetization + Billing
_Gate access behind pricing tiers so the product generates revenue._

- [x] Pricing plan design — define free/pro/team tiers, feature gates, project limits
- [x] Stripe integration — subscription checkout, billing portal, webhook handlers
- [x] Usage metering — track projects, MCP tool calls, storage per user/team
- [x] Paywall enforcement — enforce tier limits in API and UI, upgrade prompts
- [x] Billing UI — plan management page, invoices, payment method updates

## Phase 6: Launch Polish
_The last mile before public launch._

- [x] Landing page / marketing site — value prop, pricing, demo video/screenshots
- [x] Onboarding flow — first-run wizard: create project → connect agent → watch first edit. **Partial Figma clone:** Figma's first-run tutorial with interactive tooltips pointing at UI elements. Difference: our flow emphasizes agent connection (the differentiator), not manual design basics
- [x] Error monitoring + logging — Sentry or equivalent, structured server logs
- [x] Rate limiting + abuse prevention — per-user API rate limits, MCP call throttling
- [x] Legal — Terms of Service, Privacy Policy, cookie consent
- [x] Security audit — OWASP review, auth hardening, file format sandbox validation
- [x] Performance optimization — large file handling, canvas rendering perf
- [x] Documentation — user docs, API reference, agent setup guides (update existing README)

## Agent Scripting with CLI
_Replace MCP-based agent workflow with CLI + JS execution. See `dev/agent-scripting-with-cli.md` for full design._

- [x] CLI scaffold (`cli/`) — Node.js CLI with commander/yargs, commands: `login`, `project load`, `page load`, `dom`, `exec`, `components`, `tokens`. Session state in `~/.z10/`
- [x] CLI `exec` command — read stdin JS, incremental statement parsing (acorn), execute in happy-dom with Web Component support, inject `z10` global, stdout per-statement results, exit on error
- [x] CLI server communication — HTTP client for z10 API, auth token management, send statements to server, receive + compare checksums, fetch DOM state
- [x] Server API endpoints — `POST /api/projects/:id/exec` (execute JS statement), `GET /api/projects/:id/dom` (HTML + checksum, compact mode), governance enforcement
- [x] Checksum sync — compute from happy-dom state, compare with server per statement, `STALE_DOM` error on mismatch, `z10 dom` refreshes local copy
- [x] z10 Skill file — setup instructions, command reference, DOM API reference, Web Component patterns, `z10.setTokens()`, data attributes, examples, error recovery
- [x] MCP fallback — `z10_exec` MCP tool for non-CLI agents, batch mode (no streaming), accepts full JS code string
- [x] Tests — statement parsing, exec flow, stdout format, exit codes, happy-dom DOM + Web Components, checksum sync, server API, governance, integration, skill validation
