# Zero-10.design — Product Requirements Document

## Branchable UI Evolution for the Agent Era

### v3.0 — March 2026

---

## Executive Summary

Zero-10 is a design tool built on annotated web standards that introduces **branchable UI evolution** — the ability to fork, diff, merge, and scrub through interface changes the way Git handles code. Combined with an agent-native editing model and a shared format that both designers and developers can own, Zero-10 addresses the three fundamental mismatches that cause designs to diverge from production:

1. **Representation mismatch** — Design tools use proprietary formats; production uses HTML/CSS. *Zero-10's format IS HTML/CSS.*
2. **Ownership mismatch** — Designers own Figma files; developers own code. *Zero-10's format is editable by both.*
3. **Evolution mismatch** — Code evolves continuously; designs freeze at handoff. *Zero-10's branchable timeline keeps design evolution alive.*

The product has three pillars:

**Pillar 1: Branchable UI Evolution** — Git-native design history with visual diffs, forks, merge, and timeline scrubbing. Design changes are reversible, branchable, and reviewable — just like code.

**Pillar 2: Agent-Native Design** — AI coding agents edit UI structures directly through a token-efficient MCP protocol with streaming execution, semantic commands, and governed authority levels.

**Pillar 3: Design Stays in the Loop** — A reconciliation protocol that keeps the design aware of code changes, without the unrealistic promise that design perfectly survives arbitrary code transformations. The design file is a living document that adapts, not a frozen spec.

The format — a single `.z10.html` file using `data-z10-*` attributes and `<script type="application/z10+json">` metadata over standard HTML/CSS — is the enabling substrate for all three pillars, not the headline.

**Target market (v1)**: AI-native builders — solo developers, small teams, and designer-developer hybrids who ship with Claude Code, Cursor, Codex, or similar AI coding agents. This is Market 1. Markets 2 (frontend-heavy startups) and 3 (enterprise design systems) are expansion targets after product-market fit.

---

## 1. Pillar 1: Branchable UI Evolution

### 1.1 The Core Idea

Every design tool today has "version history" — a linear undo stack or a list of snapshots. This is the equivalent of `git log` with no branches. It's useless for real product work where:

- A designer explores two directions simultaneously
- A developer ships a variation the designer didn't anticipate
- A PM asks "what did this page look like before the redesign?"
- A team wants to A/B test two visual approaches

Zero-10 treats the `.z10.html` file as a **text file under Git** (because it is one). This gives us branching, merging, diffing, and history for free. But raw Git diffs of HTML are unreadable. Zero-10 adds a **visual layer** on top of Git:

### 1.2 Visual Diff

When comparing two versions (branches, commits, or timestamps), Zero-10 renders both and produces a visual diff:

- **Side-by-side rendering**: Both versions rendered as live artboards on the canvas
- **Overlay mode**: Differences highlighted with colored overlays — red for removed elements, green for added, amber for modified
- **Property diff**: For modified elements, a panel shows exactly what changed: `background: var(--blue-500) → var(--blue-600)`, `padding: 16px → 24px`
- **Semantic diff**: Changes are grouped by intent — "Token changes", "Layout changes", "New components", "Removed elements"

The visual diff reads the `data-z10-id` attributes as stable anchors for matching nodes across versions. This is why those IDs exist — they're not just for reconciliation, they're the spine of the branching system.

### 1.3 Branch/Fork Workflow

```
main ─────●─────●─────●─────●───────── (current design)
               │                │
               └──●──●          │   (designer: "dark mode exploration")
                                │
                                └──●──● (developer: "added error states")
```

**In the editor:**
- "Branch" button creates a Git branch with a descriptive name
- Branch switcher dropdown in the top bar
- Visual diff between any two branches
- "Merge" button with visual conflict resolution (if the same `data-z10-id` node was modified in both branches, show both versions side-by-side and let the designer choose)

**In the CLI:**
```bash
z10 branch "dark-mode-exploration"
z10 diff main..dark-mode-exploration --visual  # opens visual diff in editor
z10 merge dark-mode-exploration --into main
```

### 1.4 Timeline Scrubbing

The editor includes a **timeline slider** that scrubs through the Git history of the file. As you drag the slider, the canvas live-updates to show the design at each commit. This is "Final Cut Pro for UI" — you can see your design evolve over time.

Implementation: Each commit is a snapshot of the `.z10.html` file. The editor renders the file at each commit point on demand (cached after first render). The timeline shows commit messages, author (designer/developer/agent), and timestamps.

### 1.5 Design Reviews

Because the file is in Git, design reviews can happen in existing code review tools (GitHub PRs, GitLab MRs). But raw HTML diffs are unreadable. Zero-10 provides:

- **GitHub Action / CI integration**: Automatically renders visual diffs and posts them as comments on PRs that modify `.z10.html` files
- **Review link**: A URL that opens the visual diff in the Zero-10 editor (or a web viewer) for reviewers who aren't Zero-10 users
- **"Approve design changes" checkbox**: Added to PR templates, giving designers explicit sign-off on code changes that affect the design file

### 1.6 Why This Is New

| Tool | History Model | Branching | Visual Diff | Design Reviews |
|---|---|---|---|---|
| Figma | Linear version history | No | No | Comments on file |
| Paper | No history | No | No | No |
| Sketch | Manual snapshots | No | Plugin-based | No |
| Abstract (RIP) | Git-like | Yes | Yes | Yes (but died) |
| **Zero-10** | **Git-native** | **Yes** | **Yes** | **Yes (in existing CI)** |

Abstract tried this but failed because their format was proprietary (Sketch files) and the tooling was a separate app bolted on top. Zero-10's format IS text, so Git works natively. No separate sync layer, no proprietary history server, no "please wait while we process your version."

---

## 2. Pillar 2: Agent-Native Design

### 2.1 Design Principle

Getting an AI coding agent connected to Zero-10 must take **less than 60 seconds** and require **zero configuration beyond a single command or URL**.

### 2.2 Connection Methods

**Claude Code:**
```bash
claude mcp add zero10 --transport http http://127.0.0.1:29910/mcp --scope user
```

**Cursor (deep link):**
```
cursor://settings/mcp?name=zero10&url=http://127.0.0.1:29910/mcp
```

**Any Streamable HTTP MCP client (Codex, OpenCode, VS Code Copilot):**
```
URL: http://127.0.0.1:29910/mcp
```

### 2.3 Onboarding Flow

1. "Connect Agent" button always visible in editor toolbar.
2. Click → panel shows auto-detected running agents + one-click connect buttons.
3. "Test Connection" button triggers a small test edit on canvas as confirmation.
4. Live indicator: "Claude Code connected" with a green dot.
5. First tool call triggers a brief tutorial overlay.

### 2.4 Agent Governance Model

The review correctly identified that we need to specify not just agent *access* but agent *authority*. Three levels:

**Level 1: Full Edit (default for solo users)**
Agent writes directly to the file. Every edit appears immediately on canvas. The user watches and can undo. This is the fastest workflow for solo AI-native builders.

**Level 2: Propose & Approve (default for team projects)**
Agent writes to a staging branch. Changes appear in a "Proposed Changes" panel with accept/reject per change. Nothing touches the main design until the designer approves. This is similar to how Copilot shows inline suggestions.

**Level 3: Scoped Edit (configurable per node)**
Agent can only edit nodes marked with `data-z10-agent-editable="true"`. All other nodes are read-only for the agent. This gives designers fine-grained control over which parts of the design an agent can touch.

```html
<!-- Agent can edit this section freely -->
<div data-z10-node="content-area" data-z10-agent-editable="true" ...>
  ...
</div>

<!-- Agent can read but not modify this section -->
<header data-z10-node="header" data-z10-agent-editable="false" ...>
  ...
</header>
```

The governance level is set per-project in the config block and can be overridden per-node. The MCP server enforces it — tool calls that violate the governance model return an error with a clear message.

### 2.5 The MCP Command Language

Instead of generating full HTML blobs (~500-2000 tokens per element), agents emit semantic micro-commands (~50-100 tokens each) that reference existing components and tokens by name:

```
z10.node("header", {
  tag: "header", parent: "page_root",
  style: "display:flex; justify-content:space-between; padding:var(--spacing-md) var(--spacing-lg);",
  intent: "layout"
})

z10.text("logo", { parent: "header", content: "Zero-10",
  style: "font-size:var(--size-xl); font-weight:var(--weight-bold);" })

z10.instance("save_btn", { component: "Button", parent: "header",
  props: { variant: "primary", label: "Save" } })
```

### 2.6 Token Efficiency Targets

| Operation | Paper (est. tokens) | Zero-10 Target | Speedup |
|---|---|---|---|
| Button instance | ~300 (full HTML) | ~50 (z10.instance) | 6× |
| 12-card grid | ~3,000 (12 HTML blocks) | ~100 (z10.repeat + faker) | 30× |
| Color update | ~200 (write_html) | ~30 (z10.style) | 7× |
| Full dashboard page | ~8,000+ | ~1,200 | 7× |

### 2.7 Progressive Streaming Execution

Commands execute **as they are parsed from the agent's stream**, not after the full response. The user watches elements appear in real-time. Each complete command (detected by closing brace) is dispatched to the editor immediately.

### 2.8 Repeat with Faker

For repeated UI patterns, the agent describes the pattern once:

```
z10.repeat("card_grid_item", {
  parent: "card_grid", count: 12, component: "Card",
  props: {
    title: { faker: "company.name" },
    subtitle: { faker: "company.catchPhrase" },
    variant: "elevated"
  }
})
```

~100 tokens for 12 cards. The runtime generates stable fake data seeded by node ID (consistent across reloads).

### 2.9 Visual Highlighting of Agent Edits

Elements being created or modified by an agent receive real-time visual highlights:

- **Created**: Blue pulsing outline, fades after 1.5s
- **Modified**: Changed property flashes in properties panel
- **Removed**: Red flash + fade-out (300ms)
- **Parent context**: Subtle background tint on the container being edited

An "Agent Activity" panel logs recent operations with per-operation undo.

### 2.10 MCP Tool Reference

**Read Tools:**

| Tool | Purpose |
|---|---|
| `get_project_summary` | Component inventory, tokens, pages |
| `get_component_props(name)` | Props schema for a component |
| `get_node_info(id)` | Details for a node by data-z10-id |
| `get_tree(id?, depth?)` | Subtree hierarchy (compact text) |
| `get_styles(id)` | Computed CSS for a node |
| `get_screenshot(id?, scale?)` | Visual capture |
| `get_tokens(collection?)` | Token values |
| `get_guide(topic?)` | Contextual help for the agent |

**Write Tools:**

| Tool | Purpose |
|---|---|
| `z10.node(name, opts)` | Create container |
| `z10.text(name, opts)` | Create text element |
| `z10.instance(name, opts)` | Instantiate component |
| `z10.style(id, props)` | Update styles |
| `z10.move(id, opts)` | Move/reorder in tree |
| `z10.remove(id)` | Remove node |
| `z10.repeat(name, opts)` | Generate repeated elements |
| `z10.component(name, schema)` | Define/update component |
| `z10.tokens(collection, vars)` | Add/update tokens |
| `z10.batch(commands[])` | Multiple commands atomically |
| `write_html(id, html)` | Raw HTML fallback |

**Utility Tools:**

| Tool | Purpose |
|---|---|
| `find_placement(size?)` | Suggest canvas position |
| `export_react(id?)` | Generate React/Tailwind |
| `reconcile(source?)` | Trigger sync |

### 2.11 Command Determinism

Every write command has explicit behavior for edge cases. Agents must be able to predict outcomes without guessing.

**Creation semantics:**

| Command | If ID exists | If parent missing | If component unknown |
|---|---|---|---|
| `z10.node(id, opts)` | Error: `NODE_EXISTS: {id}. Use z10.style to update.` | Error: `PARENT_NOT_FOUND: {parent}` | N/A |
| `z10.instance(id, opts)` | Error: `NODE_EXISTS` | Error: `PARENT_NOT_FOUND` | Error: `COMPONENT_NOT_FOUND: {name}` |
| `z10.text(id, opts)` | Error: `NODE_EXISTS` | Error: `PARENT_NOT_FOUND` | N/A |

**Update semantics:**

| Command | If ID missing | Behavior |
|---|---|---|
| `z10.style(id, props)` | Error: `NODE_NOT_FOUND: {id}` | Merge: only specified properties change; unspecified properties preserved |
| `z10.move(id, opts)` | Error: `NODE_NOT_FOUND` | Moves node to new parent/position |
| `z10.remove(id)` | Error: `NODE_NOT_FOUND` | Removes node and all children |

**Upsert pattern:**
For agents that want create-or-update behavior, `z10.batch` supports a `mode: "upsert"` option:
```
z10.batch([
  { op: "node", id: "header", opts: {...} }
], { mode: "upsert" })
```
In upsert mode, if the node exists, the command behaves as `z10.style` (merge properties). If it doesn't exist, it behaves as `z10.node` (create). This is the recommended pattern for agents that may be re-running a design generation.

**Error reporting:**
All errors include the failed command, the reason, and a suggestion. Errors do NOT halt batch execution unless `{ strict: true }` is set — by default, failed commands are skipped and reported in the batch response, allowing the rest of the batch to proceed.

### 2.12 Command Surface Area

The command set is intentionally small. The key insight: `z10.style` handles ALL visual changes because it's just CSS properties. We don't need separate commands for flex layout, grid layout, colors, typography, or spacing — they're all CSS properties passed to one command.

The complete primitive set (**12 commands**):

| # | Command | Purpose |
|---|---|---|
| 1 | `z10.node` | Create container element |
| 2 | `z10.text` | Create text element |
| 3 | `z10.instance` | Instantiate a component |
| 4 | `z10.repeat` | Generate repeated elements with faker |
| 5 | `z10.style` | Update any CSS properties on any node |
| 6 | `z10.move` | Reorder/reparent a node |
| 7 | `z10.remove` | Delete a node |
| 8 | `z10.component` | Define or update a component schema |
| 9 | `z10.tokens` | Add or update design tokens |
| 10 | `z10.batch` | Execute multiple commands atomically |
| 11 | `z10.attr` | Set data attributes or HTML attributes |
| 12 | `write_html` | Raw HTML escape hatch |

This covers: layout (via `z10.style` with `display`, `flex-direction`, `grid-template-columns`), responsive (via `z10.style` on breakpoint-scoped selectors), variants (via `z10.component` schema updates + `z10.style` for variant rules), slots (via `z10.node` with slot attributes), and interactions (via `z10.attr` for prototype-related data attributes).

If an operation can't be expressed in 12 primitives, `write_html` is the escape hatch. But in practice, these 12 cover >95% of design operations because CSS is the universal language for visual properties.

---

## 3. Pillar 3: Design Stays in the Loop

### 3.1 What This Is Not

This is NOT "design survives production." That promise is aspirational to the point of dishonesty. Production code will always contain things the design can't represent: conditional rendering, error boundaries, loading skeletons, state machines, accessibility logic, performance optimizations. Claiming the design file perfectly round-trips through all of that is a lie.

### 3.2 What This IS

The design file **knows** what happened in code. It stays **aware** and **adaptive**, even when it can't perfectly represent every change. Concretely:

- Design-intent changes (colors, spacing, typography) are detected and proposed back to the design file
- Code-intent changes (new logic, event handlers, conditional UI) are marked as "code regions" that the design acknowledges but doesn't try to control
- Ambiguous changes are surfaced to the designer for a decision
- The design file is never "stale" — it always reflects the latest understanding of what the product looks like

### 3.3 The Reconciliation Pipeline

The pipeline at a glance:

```
Code Snapshot → DOM Normalize → Node Match → Property Diff → Classify → Screenshot Verify → Patch → Review
     ▼              ▼              ▼             ▼             ▼            ▼              ▼        ▼
  AST parse     Strip logic    z10-id keys   CSS deltas    Intent +     Vision model   Generate  Designer
  + render      + handlers     + fallback     per node     heuristics   cross-check    .z10.html  accepts
               + conditionals  matching                                                 patches   or rejects
```

The detailed steps:

```
STEP 1: Capture
  Developer triggers: z10 sync --source ./src --design ./design.z10.html
  System captures: current code state (files, ASTs) + rendered screenshots

STEP 2: DOM Normalization
  For each component in the codebase:
    Parse JSX/TSX → extract HTML structure
    Resolve className → computed CSS values
    Normalize: strip event handlers, conditional wrappers, React-specific constructs
    Output: a "design-equivalent DOM" with only visual properties

STEP 3: Node Matching
  For each node in the normalized DOM:
    Match to .z10.html nodes by data-z10-id attribute (primary key)
    For nodes without data-z10-id: fuzzy match by tag + class + position in tree
    Unmatched code nodes → candidates for "code region" marking
    Unmatched design nodes → candidates for "removed in code" flagging

STEP 4: Property Diffing
  For each matched pair (design node, code node):
    Diff all CSS properties: background, padding, color, font-*, border, etc.
    Diff text content
    Diff structural children (insertions, deletions, reorderings)
    Output: a list of (property, design_value, code_value, delta) tuples

STEP 5: Classification
  For each delta:
    IF only CSS values changed AND node intent is "design" or "decoration":
      → DESIGN-INTENT (auto-updatable)
    IF new elements were added with no design counterpart:
      → CODE-INTENT (mark as code region)
    IF elements were removed:
      → AMBIGUOUS (surface to designer)
    IF structural changes to a "layout" intent node:
      → AMBIGUOUS (surface to designer)
    IF event handlers or conditional rendering added:
      → CODE-INTENT (invisible to design)

STEP 6: Screenshot Verification
  Render the design file and the code side-by-side
  Vision model identifies visual regions that differ
  Cross-reference with property-level diffs from Step 4
  Flag any visual discrepancies not explained by the property diffs
  (These are usually caused by CSS interactions the property diff missed)

STEP 7: Patch Generation
  For DESIGN-INTENT changes: generate a patch to the .z10.html file
  For CODE-INTENT changes: add data-z10-code-region attributes
  For AMBIGUOUS changes: generate both options (update design / mark as code)
  Present all changes in the Sync panel for designer review

STEP 8: Application
  Designer reviews changes in Sync panel
  Accepts, rejects, or edits each change
  Accepted changes are committed to the .z10.html file (on a branch if governance requires it)
```

### 3.4 Preventing Hallucinated Merges

The review asks: "what prevents hallucinated merges?" Answer:

1. **data-z10-id is the primary matching key.** We don't rely on AI to guess which elements correspond — the IDs are embedded in the code by the export step and survive developer editing. No ID match = no auto-merge.

2. **Classification is conservative.** Anything that doesn't clearly match a known pattern is classified as AMBIGUOUS and requires human review. The agent proposes; the designer decides.

3. **Screenshot verification is a safety net.** Even if the property-level diff looks clean, the visual diff catches CSS interaction effects (cascading changes, specificity issues, media query differences) that the AST diff misses.

4. **The sync is on-demand, not automatic.** The developer chooses when to sync. There's no background process silently modifying the design file.

5. **Every sync creates a Git commit.** If a merge goes wrong, it's reversible with `git revert`. Branchable evolution (Pillar 1) protects against bad syncs.

### 3.5 Node Identity Resilience

The entire system depends on `data-z10-id` attributes surviving developer edits. Here's how the matching degrades gracefully when IDs are lost:

**Tier 1: Exact ID match (highest confidence)**
Both design and code have `data-z10-id="header"`. Match is certain. This covers ~80% of cases because most developer edits modify properties, not element identity.

**Tier 2: Structural + content match (high confidence)**
ID is missing in code (developer deleted the attribute or rewrote the component). Fallback: match by combination of tag name, position in parent, text content, CSS class names, and child structure. Example: a `<header>` that's the first child of `<body>` with a text node "Zero-10" inside — even without an ID, the match is obvious.

**Tier 3: Component signature match (medium confidence)**
The code has a React component `<Button variant="primary" label="Save" />` that maps to a design instance with the same component name and similar props. Even if the rendered DOM structure differs, the component-level match is reliable.

**Tier 4: Visual region match (low confidence)**
Screenshot comparison identifies a visual region that looks similar. Used only as a last resort for cases where structure has changed significantly. These matches are always classified as "ambiguous" and require designer review.

**Tier 5: No match (unmatched nodes)**
Code nodes with no design counterpart → code regions. Design nodes with no code counterpart → flagged as "possibly removed." Both require human decision.

The system reports match confidence per node in the sync results, so the designer knows which matches are reliable and which need scrutiny.

### 3.6 Sync Panel UI

Shows detected changes grouped by classification:

- **Design Changes** (auto-applicable): Color, spacing, typography deltas. "Accept All" button.
- **Code Regions** (informational): New developer-added elements. "Acknowledge" marks them in the design.
- **Needs Review** (ambiguous): Side-by-side before/after thumbnails per change. Accept / Reject / Edit buttons.

---

## 4. The File Format

### 4.1 Decision

A Zero-10 project uses a single `.z10.html` file as the working format. The file is valid HTML, browser-renderable, and Git-friendly.

### 4.2 Why Single-File Beats Multi-File (For Now)

The single-file decision is primarily an **agent ergonomics** decision, not a human ergonomics decision. The reasoning:

- **LLMs reason dramatically better with single-document context.** A multi-file project requires import resolution, cross-file reference tracking, and multiple tool calls just to understand the dependency graph. A single file gives the agent complete context in one read. This is the difference between an agent that "gets it" on the first prompt and one that hallucinates component APIs because it hasn't loaded the right dependency file.
- **Cross-file edits are the #1 source of agent errors.** When an agent needs to create a component (file A), register it (file B), add its styles (file C), and instantiate it on a page (file D), every file boundary is a failure point. Single-file means component definition, styles, and usage are all in the same document — one `z10.batch` call, zero coordination errors.
- **Context windows prefer locality.** Even with 200K+ token context windows, relevance decays with distance. In a single file, the token definitions are physically near the component styles that use them. In a multi-file project, the agent must actively decide which files to load — and it often decides wrong.
- **Distribution and onboarding friction is near-zero.** "Here's the file" is a complete instruction. "Here's the repo, install dependencies, run the build step, open the project file" is where you lose 60% of potential users.

For human workflows at scale, multi-file is eventually necessary. This is addressed below.

### 4.3 Open Question: Canonical vs. Package Form

> **NOTE**: Whether the single file is the canonical form or a bundled artifact of a multi-file project structure is an open question we are explicitly deferring. For v1, we proceed with single-file as canonical. If scaling issues (merge conflicts, file size, team workflows) demand it, we will introduce a multi-file canonical form with `z10 bundle` producing the single-file artifact. The single-file format is designed so that either direction is possible — the `<head>` sections are self-contained and mechanically splittable by component.

### 4.4 File Structure

```
<html data-z10-project="...">
<head>
  <script type="application/z10+json" data-z10-role="config"> ... </script>
  <style data-z10-tokens="primitives"> ... </style>
  <style data-z10-tokens="semantic"> ... </style>

  <!-- Per component: script (metadata) + style + template -->
  <script type="application/z10+json" data-z10-role="component"> ... </script>
  <style data-z10-component-styles="Button"> ... </style>
  <template data-z10-template="Button"> ... </template>

  <style data-z10-page-styles="Dashboard"> ... </style>
</head>
<body>
  <!-- Page compositions -->
  <div data-z10-page="Dashboard" data-z10-mode="light">
    ...
  </div>
</body>
</html>
```

### 4.5 Security Model

Since `.z10.html` is browser-renderable, the format has strict sandboxing rules:

1. **`<script type="application/z10+json">` is the ONLY allowed script type.** These blocks are JSON metadata parsed by the editor/runtime — they are never executed as JavaScript by the browser.

2. **The Z10 runtime** (`<script data-z10-runtime>`) is the only executable script in the file. It is bundled by the editor, integrity-checked via a hash attribute, and never modified by hand. The editor validates the runtime hash on file open and warns if it has been tampered with.

3. **No remote imports.** The file must be self-contained. No `<link>` to external stylesheets, no `<script src="...">`, no `<iframe>` to external URLs. The editor strips or warns on any external references.

4. **CSP header**: When served by the editor's preview server, the Content-Security-Policy is: `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-[runtime-hash]'; img-src data: blob:;`

5. **Font loading**: Fonts are either embedded as base64 `@font-face` declarations or loaded from a curated allowlist of CDNs (Google Fonts only in v1).

---

## 5. The Visual Editor

### 5.1 Why the Editor Matters

The review argued the editor is "80% of the engineering work." We disagree with the percentage but agree with the sentiment: **if the canvas isn't fluid, adoption dies.** However, the engineering breakdown is different from Figma's because we don't rebuild what the browser already does well.

### 5.2 Three-Tier Rendering Architecture

**Tier 1: WebGPU Canvas (the viewport)**
Custom 2D renderer for the infinite canvas surface. Handles pan, zoom, selection, guides, snapping, agent edit highlights, and overview-level artboard rendering. This is the only part we build from scratch.

**Tier 2: DOM Islands (artboard interiors)**
Individual artboards render using the browser's native DOM/CSS engine inside shadow DOM containers. When zoomed into editing range (~50%+), Tier 1 crossfades to Tier 2 for pixel-perfect, live CSS rendering. This means we get text layout, flexbox, grid, hover states, and font rendering for free — no custom engines needed.

**Tier 3: The File**
The `.z10.html` file itself. Opens in any browser. No editor required for viewing.

### 5.3 What This Means for Engineering Scope

| Figma Rebuilds from Scratch | Zero-10 Reuses from Browser |
|---|---|
| Text layout engine | Browser native (Tier 2) |
| CSS constraint solver | Browser native flexbox/grid (Tier 2) |
| Font renderer | Browser native (Tier 2) |
| Vector network engine | SVG + WebGPU rasterization |
| Custom compositor | WebGPU for Tier 1 only |

We estimate the editor is ~40% of total engineering effort, not 80%. The reconciliation pipeline, MCP server, and branchable evolution system are each substantial bodies of work.

### 5.4 Figma-Equivalent Interactions

**Canvas**: Infinite pan/zoom, click/shift-click/marquee select, drag to move, handles to resize, smart guides, snapping, rulers, frame creation (F key), copy/paste, Cmd+D duplicate, undo/redo.

**Panels**:
- **Left: Layers** — Tree view from `data-z10-node` attributes. Component instances with icon. Code regions with badge.
- **Right: Properties** — CSS properties organized by section (Layout, Size, Fill, Stroke, Effects, Typography). Token-bound values show token name. Component props for instances.
- **Top: Tools** — Select, Frame, Text, Shape, Pen, Hand, Zoom + Zero-10-specific (Agent, Sync, Branch).
- **Bottom: Pages** — Tab navigation.

### 5.5 Where We Differ from Figma

**Driven by HTML/CSS-nativeness:**

| Area | Figma | Zero-10 |
|---|---|---|
| Layout system | Auto Layout (proprietary names) | CSS Flexbox/Grid (real property names: `display`, `flex-direction`, `gap`) |
| Fill system | Array of paint objects | CSS `background` (gradients, images, layers — standard syntax) |
| Constraints | Pin-to-edge constraints | CSS `position` + flex/grid alignment |
| Export | PNG/SVG/PDF + lossy code | "Export as React" is the primary action; visual exports secondary |
| Dev Mode | Separate view with CSS approximation | No separate mode — the format IS CSS |
| Prototyping | Custom prototype engine | Live HTML in iframe with thin interaction runtime |

**Driven by the agent story:**

| Area | Figma | Zero-10 |
|---|---|---|
| Agent awareness | None | Agent Activity panel with real-time operation log |
| Edit attribution | None | Each node shows last editor (Designer / Agent / Developer) |
| Code regions | None | Developer-added elements visible in layers panel with distinct badge |

**Driven by branchable evolution:**

| Area | Figma | Zero-10 |
|---|---|---|
| Version history | Linear snapshots | Git branches with visual diff |
| Design review | Comments on file | Visual diffs in GitHub PRs |
| Timeline | "Revert to version" | Scrub slider showing design evolution over time |
| Forking | Duplicate file | `z10 branch` — lightweight, mergeable |

---

## 6. The Z10 Runtime

### 6.1 Purpose

A lightweight (~8KB gzipped) script included in the file that handles template instantiation, faker data, bindings, and mode switching. Progressive enhancement — the file renders without it, but instances don't expand.

### 6.2 Faker Integration

Built-in lightweight faker module (~4KB) supporting: person names, company names, lorem text, dates, numbers, images, addresses, finance amounts, colors, phone numbers. Seeded by `data-z10-id` for stable values across reloads.

### 6.3 Dynamic Data

Optional `data-z10-datasource` attribute connects to live APIs. The editor provides a toggle between faker and live data for preview.

---

## 7. Technical Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Zero-10 Editor                         │
│                                                          │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Tier 1     │  │ Tier 2       │  │ UI Chrome        │ │
│  │ WebGPU     │  │ DOM Islands  │  │ (React/Solid)    │ │
│  │ Canvas     │  │ (shadow DOM) │  │                  │ │
│  │            │  │              │  │ Layers           │ │
│  │ Pan/Zoom   │  │ Live CSS     │  │ Properties       │ │
│  │ Selection  │  │ rendering    │  │ Tokens           │ │
│  │ Guides     │  │ of artboards │  │ Agent Activity   │ │
│  │ Highlights │  │              │  │ Sync Panel       │ │
│  └────────────┘  └──────────────┘  │ Branch/Timeline  │ │
│         │               │          └──────────────────┘ │
│         └───────────────┴───────────────┘               │
│                         │                                │
│              ┌──────────▼──────────┐                     │
│              │  Document Model     │                     │
│              │  (TypeScript v1,    │                     │
│              │   WASM v2)          │                     │
│              │                     │                     │
│              │  - Node tree        │                     │
│              │  - Style resolver   │                     │
│              │  - CRDT sync        │                     │
│              │  - Git integration  │                     │
│              │  - Undo/redo stack  │                     │
│              └──────────┬──────────┘                     │
│                         │                                │
│              ┌──────────▼──────────┐                     │
│              │  .z10.html file     │                     │
│              │  (single file)      │                     │
│              └──────────┬──────────┘                     │
│                         │                                │
└─────────────────────────┼────────────────────────────────┘
                          │
               ┌──────────▼──────────┐
               │  MCP Server         │
               │  (localhost:29910)  │
               │                     │
               │  Read/Write tools   │
               │  Streaming exec     │
               │  Governance model   │
               │  Agent highlighting │
               └──────────┬──────────┘
                          │
               ┌──────────▼──────────┐
               │  AI Coding Agents   │
               │  Claude Code        │
               │  Cursor / Codex     │
               │  Any MCP client     │
               └─────────────────────┘
```

Note: Document model starts as TypeScript in v1, with a migration path to WASM (Rust) in v2 when performance demands it on large files.

---

## 8. Competitive Positioning

### 8.1 Landscape

| Competitor | Strength | Zero-10 Advantage |
|---|---|---|
| **Figma** | Dominant, great editor, Dev Mode, AI features shipping | Proprietary format kills round-trip. No branching. Agent story is bolt-on. |
| **Paper** | HTML/CSS native, MCP server, agent-friendly | No reconciliation. No typed components. No branching. No governance model. Canvas, not a system. |
| **Framer** | Design-to-production for websites | Website builder, not app design tool. No agent story. |
| **Builder.io / Locofy / Anima** | Design-to-code pipelines | One-directional. Code doesn't flow back. No evolution story. |
| **Abstract (dead)** | Git-for-design | Proprietary format (Sketch). Separate app. Too much friction. |

### 8.2 Positioning Statement

Zero-10 is the design tool where **interface evolution is a first-class operation** — forkable, diffable, mergeable, reviewable — built on web standards that AI agents can read and write natively.

### 8.3 Why Not Just Copy Paper

Paper is a canvas. Zero-10 is a system.

Paper and Zero-10 share the HTML/CSS-native philosophy. But Paper's value proposition ends at "design that exports as code." Zero-10's value proposition starts there and adds: branchable evolution, agent governance, reconciliation, typed component schemas, semantic micro-commands, faker-powered repetition, and visual design reviews in CI.

If Paper is "Figma but the canvas is HTML," Zero-10 is "Git for UI + an agent-native design editor."

### 8.4 What Zero-10 Replaces

**For v1 users (AI-native builders):** Zero-10 replaces Figma. These users currently design in Figma, export imperfect code, and immediately lose the connection between design and implementation. Zero-10 gives them a design tool where that connection never breaks.

**For expansion users (frontend teams):** Zero-10 replaces Figma + Storybook + Abstract. The single `.z10.html` file serves as design system source of truth (Figma), component documentation (Storybook), and version-controlled design history (Abstract) — in one artifact.

**For the long-term platform play:** Zero-10 stops being a design tool and becomes **UI change infrastructure**. The branchable evolution engine, visual diff renderer, and PR review system could apply to ANY frontend codebase — React apps, Next.js projects, Flutter apps, even native mobile UIs rendered to screenshots. The `.z10.html` format is the first application of this infrastructure, not the only one.

This trajectory:
```
v1: Design tool for AI-native builders         ("better Figma")
v2: Design system platform for frontend teams  ("Figma + Storybook + Abstract")
v3: UI change infrastructure for all frontends ("GitHub for interfaces")
```

The v3 vision is where the long-term moat lives. Visual diffs in PRs, branchable design experiments, and agent-authored UI changes are valuable regardless of whether the source file is `.z10.html`, a React codebase, or a Svelte project. But v1 must earn the right to get there by being a genuinely great design tool first.

---

## 9. Milestones

### Phase 1: Canvas + Agent Foundation (Months 1-4)
- Single-file format spec finalized
- WebGPU canvas (pan/zoom/select) + DOM island rendering
- Properties panel (layout, fill, typography)
- MCP server with core read/write tools + streaming execution
- `z10.node`, `z10.text`, `z10.style`, `z10.instance` commands
- Token system (CSS custom properties + modes)
- Agent highlighting (active edit visualization)
- Agent governance: Level 1 (full edit) and Level 3 (scoped)
- One-command connection for Claude Code, Cursor

### Phase 2: Components + Branching (Months 5-7)
- Component definition, inheritance, variants
- Layers panel with full tree editing
- `z10.repeat` with faker
- Z10 runtime (template instantiation, bindings)
- Export to React + Tailwind
- Git integration: branch/fork from editor
- Visual diff between branches/commits
- Timeline scrubber

### Phase 3: Reconciliation + Reviews (Months 8-10)
- `z10 sync` CLI
- Reconciliation pipeline (Steps 1-8 from Section 3.3)
- Sync panel UI
- Agent governance: Level 2 (propose & approve)
- GitHub Action for visual diffs in PRs
- Collaborative editing (CRDT)

### Phase 4: Scale + Launch (Months 11-12)
- Performance optimization for large files
- Figma file import (~85% fidelity)
- Additional export targets (Vue, Svelte)
- Security audit of file format
- Public launch targeting AI-native builders

---

## 10. Success Metrics

| Metric | Target (6 months post-launch) |
|---|---|
| Agent connected in first session | >70% of new users |
| Time from install to first agent edit | <5 minutes |
| Projects using branches | >30% of active projects |
| Visual diffs viewed per project/month | 5+ |
| Reconciliation syncs per project/month | 3+ |
| Weekly active projects | 5,000+ |
| "I can't go back to Figma" in interviews | >40% of active users |

---

## 11. Appendix: Response to External Reviews

### Review Round 1 (v1 → v2)

| Critique | Response | Status |
|---|---|---|
| "Overemphasizes file format" | Restructured around three pillars | ✅ Addressed |
| "Under-specifies reconciliation" | Added 8-step pipeline + anti-hallucination safeguards | ✅ Addressed |
| "Needs agent governance model" | Added three governance levels | ✅ Addressed |
| "Design survives production is unrealistic" | Reframed as "Design Stays in the Loop" | ✅ Addressed |
| "Editor is 80% of work" | Pushed back: Tier 2 DOM islands reduce to ~40% | ✅ Rebutted |
| "PRD ignores competitors" | Pushed back: Section 8 has positioning. Added "what we replace" | ✅ Rebutted + Extended |

### Review Round 2 (v2 → v3)

| Critique | Response | Status |
|---|---|---|
| "Single-file needs more justification" | Added Section 4.2: agent ergonomics argument | ✅ Addressed |
| "MCP commands need determinism" | Added Section 2.11: create/update/upsert semantics, error handling | ✅ Addressed |
| "Command surface area will explode" | Added Section 2.12: 12 primitives, `z10.style` handles all visual changes | ✅ Addressed |
| "Node identity will break under refactoring" | Added Section 3.5: 5-tier graceful degradation model | ✅ Addressed |
| "What does Zero-10 replace?" | Added Section 8.4: v1/v2/v3 trajectory from tool to platform | ✅ Addressed |
| "Reconciliation pipeline needs a diagram" | Added visual pipeline diagram in Section 3.3 | ✅ Addressed |
| "Reconciliation is underspecified" | Pushed back: 8-step pipeline was already in v2. Reviewer skimmed. | ✅ Rebutted |
| "Streaming execution is excellent" | Agreed. Already in spec. | ✅ Confirmed |
| "Target market is correctly constrained" | Agreed. Already in spec. | ✅ Confirmed |
| "UI change infrastructure is the long-term moat" | Agreed. Added to Section 8.4 as v3 platform vision. | ✅ Extended |
