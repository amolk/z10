# Zero-10 — Road to Launch

Goal: launchable SaaS with monetization, targeting AI-native builders.
Items ordered by dependency — each phase builds on the previous.

---
## TODO: Agent Scripting with CLI
_Replace MCP-based agent workflow with CLI + JS execution. See `dev/agent-scripting-with-cli.md` for full design._

- [x] CLI scaffold (`cli/`) — Node.js CLI with commander/yargs, commands: `login`, `project load`, `page load`, `dom`, `exec`, `components`, `tokens`. Session state in `~/.z10/`
- [x] CLI `exec` command — read stdin JS, incremental statement parsing (acorn), execute in happy-dom with Web Component support, inject `z10` global, stdout per-statement results, exit on error
- [x] CLI server communication — HTTP client for z10 API, auth token management, send statements to server, receive + compare checksums, fetch DOM state
- [x] Server API endpoints — `POST /api/projects/:id/exec` (execute JS statement), `GET /api/projects/:id/dom` (HTML + checksum, compact mode), governance enforcement
- [x] Checksum sync — compute from happy-dom state, compare with server per statement, `STALE_DOM` error on mismatch, `z10 dom` refreshes local copy
- [x] z10 Skill file — setup instructions, command reference, DOM API reference, Web Component patterns, `z10.setTokens()`, data attributes, examples, error recovery
- [x] MCP fallback — `z10_exec` MCP tool for non-CLI agents, batch mode (no streaming), accepts full JS code string
- [x] Tests — statement parsing, exec flow, stdout format, exit codes, happy-dom DOM + Web Components, checksum sync, server API, governance, integration, skill validation

---

## Ready to launch
- [ ] Deploy to production — CI/CD pipeline, staging + prod environments, domain + SSL

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

## Notes
- Core library (format, MCP tools, CLI, runtime, exports) is complete — 277 tests across 13 files
- Phases 1-6 are the critical path to a paid launch
- Post-launch items are ordered by expected user impact
- WebGPU canvas deferred to post-launch — DOM-based rendering is sufficient for MVP and dramatically reduces initial editor complexity
