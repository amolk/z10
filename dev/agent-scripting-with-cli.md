# Agent Scripting API for z10 Design Changes

## Context

z10 needs a way for AI agents to make multi-step design changes. The current approach (individual MCP tool calls or JSON command batches) is limiting — no loops, no conditionals, no bulk operations, and agents waste tokens constantly querying state.

## Decisions

### 1. JavaScript — not DSL, not JSON commands

**Rejected approaches:**
- **JSON command batches**: Too limiting — can't express loops, conditionals, bulk query+modify
- **Custom DSL**: Cardinal rule — never use a DSL for control flow. LLMs must be trained on it. Endless special cases.
- **JSX operation elements** (`<Move>`, `<ForEach>`): Still a DSL disguised as markup
- **Declarative diff/patch**: Can't handle component definitions, bulk conditional operations

**Why JavaScript:**
- LLMs generate reliable JS trivially — billions of tokens of training data
- Full language: loops, conditionals, variables, functions are native
- z10 is already TypeScript/Node.js — zero new runtime dependencies

### 2. CLI — not MCP — as the primary agent interface

**Why CLI over MCP:**
- stdin/stdout IS the streaming protocol — no protocol invention needed
- Streaming execution with fail-fast: pipe code in, get per-statement results out, process exits on error
- Session state is natural: CLI keeps local DOM in memory between commands
- Agent framework agnostic: any agent with Bash access works
- A Skill (documentation) is all the agent needs — no special client-side code

**MCP still exists** for the web editor and non-CLI integrations, but the primary agent workflow is CLI + Skill.

### 3. Literal Web Components for component definitions

Not "inspired by" — actual `class X extends HTMLElement` with `customElements.define()`. LLMs know this API. z10 extends only with an optional `static z10Props` for prop schemas in the design tool UI.

## Architecture

### CLI-based streaming execution

```
Agent (Bash tool)
  │
  │  z10 exec <<'EOF'
  │  const nav = document.getElementById('left-nav');
  │  nav.appendChild(document.createElement('chat-bubble'));
  │  EOF
  │
  ▼
z10 CLI (local process)
  ├── parses stdin for complete JS statements
  ├── executes each against local DOM (happy-dom)
  ├── streams each to z10 server for application
  ├── checksum match per statement
  ├── stdout: result of each statement
  │     ✓ const nav = document.getElementById('left-nav')
  │     ✓ nav.appendChild(...)
  │     ✗ ERROR: node 'item-5' not found (stale DOM)
  │     [process exits with error code]
  └── agent sees exit + error, runs `z10 dom`, retries
```

### z10 CLI commands

```bash
# One-time setup
z10 login                          # authenticate with z10 account

# Session setup
z10 project load <project-id>      # set current project
z10 page load <page-id>            # set current page

# Read state
z10 dom                            # compact tree view of current page
z10 dom --full                     # full z10 HTML
z10 components                     # list registered components
z10 tokens                         # list design tokens

# Execute code — pipe JS via stdin
z10 exec <<'EOF'
// Standard DOM API + Web Components
const nav = document.getElementById('left-nav');
for (const btn of nav.querySelectorAll('.btn')) {
  btn.style.opacity = '0.5';
}
const bubble = document.createElement('chat-bubble');
bubble.setAttribute('variant', 'sent');
nav.appendChild(bubble);
EOF

# Define a component
z10 exec <<'EOF'
class ChatBubble extends HTMLElement {
  static observedAttributes = ['variant', 'content'];
  static z10Props = {
    variant: { type: 'enum', options: ['sent', 'received'], default: 'received' },
    content: { type: 'string', required: true }
  };
  constructor() { super(); this.attachShadow({mode:'open'}); }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    this.shadowRoot.innerHTML = `
      <style>.bubble { padding: 12px; border-radius: 16px; }</style>
      <div class="bubble ${this.getAttribute('variant')}">
        ${this.getAttribute('content')}
      </div>
    `;
  }
}
customElements.define('chat-bubble', ChatBubble);
EOF
```

### z10 exec: statement-level execution flow

1. CLI reads stdin, uses incremental JS parser (acorn) to detect complete top-level statements
2. Each statement is executed against local DOM (happy-dom instance)
3. Each statement is streamed to z10 server via HTTP
4. After each statement: compute local checksum, compare with server checksum
5. stdout: `✓ <statement summary>` or `✗ ERROR: <message>`
6. On checksum mismatch or server error: print error, exit with non-zero code
7. Agent sees process exit, reads stdout for error context, runs `z10 dom` to refresh, retries

### Session state

The CLI maintains state between commands:
- Current project + page context (set by `z10 project load` / `z10 page load`)
- Local DOM copy (happy-dom instance, seeded from z10 server)
- Registered Web Components (persisted across `z10 exec` calls)
- `z10 dom` reads from local copy — fast, no round-trip
- Background sync: CLI detects server-side changes, warns on next command

### Sync with z10 server

```
z10 CLI (local DOM)  ◄──checksum──►  z10 server (source of truth)
```

- After each `z10 exec` statement: local checksum compared with server checksum
- If human edits design in z10 web editor between agent commands:
  - Next `z10 exec` detects checksum mismatch at first statement
  - Exits with `STALE_DOM` error
  - Agent runs `z10 dom` to get fresh state, retries
- `z10 dom` always fetches from server and updates local copy

## API Surface

### DOM manipulation (standard Web APIs)

The agent writes standard DOM code. happy-dom provides the full API:

```js
// Query
document.getElementById('left-nav')
document.querySelector('[data-z10-component="Button"]')
document.querySelectorAll('.nav-item')
element.closest('.container')
element.children, element.parentElement

// Mutate
parent.appendChild(child)
parent.insertBefore(newNode, refNode)
parent.removeChild(child)
element.remove()

// Style
element.style.padding = '8px'
element.style.display = 'flex'
element.style.setProperty('--custom', 'value')

// Content
element.textContent = 'Hello'
element.innerHTML = '<span>rich</span>'

// Attributes
element.setAttribute('data-z10-intent', 'layout')
element.classList.add('active')
element.dataset.z10Id = 'new-node'
```

### Component system (standard Web Components)

```js
class ChatBubble extends HTMLElement {
  static observedAttributes = ['variant', 'content'];

  // z10 extension: prop schema for design tool property panel
  static z10Props = {
    variant: { type: 'enum', options: ['sent', 'received'], default: 'received' },
    content: { type: 'string', required: true }
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  render() {
    const variant = this.getAttribute('variant') || 'received';
    const content = this.getAttribute('content') || '';
    this.shadowRoot.innerHTML = `
      <style>
        .bubble { padding: 12px; border-radius: 16px; }
        .sent { background: var(--color-primary); color: white; }
        .received { background: var(--color-surface); }
      </style>
      <div class="bubble ${variant}">${content}</div>
    `;
  }
}
customElements.define('chat-bubble', ChatBubble);

// Instantiation — standard DOM
const bubble = document.createElement('chat-bubble');
bubble.setAttribute('variant', 'sent');
bubble.setAttribute('content', 'Hello!');
sidebar.appendChild(bubble);
```

### Design tokens (z10-specific, small surface)

```js
// z10 global for token management
z10.setTokens('semantic', {
  '--color-primary': '#3b82f6',
  '--color-surface': '#f8fafc'
});

z10.setTokens('primitives', {
  '--blue-500': '#3b82f6',
  '--gray-50': '#f8fafc'
});
```

### Example: original seed scenario

```js
// Find and update existing text
const t1 = document.querySelector('[data-z10-id="left-nav"] .nav-item:nth-child(4) span');
t1.textContent = 'Hello';
t1.style.background = '#223411';

// Add new item at position
const nav = document.getElementById('left-nav');
const newItem = document.createElement('div');
newItem.className = 'nav-item';
newItem.textContent = 'New order';
newItem.style.padding = '8px 12px';
nav.insertBefore(newItem, nav.children[2]);

// Add component instance
const bubble = document.createElement('chat-bubble');
bubble.setAttribute('variant', 'received');
bubble.setAttribute('content', 'Hi there');
nav.appendChild(bubble);

// Bulk operation — pure JS
for (const btn of document.querySelectorAll('[data-z10-component="Button"]')) {
  btn.style.opacity = '0.5';
  btn.style.cursor = 'not-allowed';
}
```

## z10 Skill

The Skill provides the agent with:
1. **Setup instructions**: install z10 CLI, `z10 login`
2. **Command reference**: `z10 project load`, `z10 page load`, `z10 dom`, `z10 exec`, etc.
3. **API reference**: DOM methods available, Web Component pattern, `z10.setTokens()`, `static z10Props`
4. **z10 data attributes**: `data-z10-id`, `data-z10-component`, `data-z10-intent`, `data-z10-editor`, `data-z10-agent-editable`
5. **Examples**: common patterns (create, move, bulk modify, define component, instantiate)
6. **Error handling**: what `z10 exec` errors look like, how to recover (refresh DOM, retry)

## Implementation Plan

### Step 1: z10 CLI scaffold (`cli/`)
- Node.js CLI using a lightweight framework (commander or yargs)
- Commands: `login`, `project load`, `page load`, `dom`, `exec`, `components`, `tokens`
- Session state management (current project, page, auth token)
- Config stored in `~/.z10/`

### Step 2: z10 CLI `exec` command (`cli/src/exec.ts`)
- Read stdin for JS code
- Use acorn for incremental statement parsing
- happy-dom as the DOM runtime (has Web Component support)
- Execute each statement in happy-dom context via `vm` module
- Inject `z10` global (setTokens, etc.)
- stdout: per-statement results
- Exit with error on failure

### Step 3: z10 CLI server communication (`cli/src/api.ts`)
- HTTP client for z10 server API
- Auth token management (from `z10 login`)
- Send executed statements to server
- Receive checksums, compare with local
- Fetch DOM state (`z10 dom`)

### Step 4: z10 server API endpoints (`src/api/`)
- `POST /api/projects/:id/exec` — receive + execute JS statement
- `GET /api/projects/:id/dom` — return current page HTML + checksum
- `GET /api/projects/:id/dom?compact=true` — return compact tree view
- Checksum computation (hash of serialized HTML)
- Governance enforcement during execution

### Step 5: Checksum sync (`cli/src/sync.ts`)
- Compute checksum from happy-dom serialized state
- Compare with server checksum after each statement
- On mismatch: emit error, exit process
- `z10 dom` refreshes local DOM from server

### Step 6: z10 Skill file
- Installation and setup instructions
- Full command and API reference
- Examples and error recovery patterns

### Step 7: MCP fallback (`src/mcp/tools.ts`)
- Add `z10_exec` MCP tool for non-CLI agents
- Accepts full JS code string, executes in sandbox
- Returns result + checksum (no streaming, batch mode)
- Keeps existing MCP tools working

### Step 8: Tests
- CLI: statement parsing, exec flow, stdout format, exit codes
- happy-dom: DOM operations, Web Component registration + instantiation
- Checksum: compute, compare, detect drift
- Server API: exec endpoint, DOM endpoint, governance
- Integration: full flow from `z10 exec` stdin through server sync
- Skill: validate examples are correct and runnable

## Open Questions

1. **Governance enforcement**: During execution (each DOM operation checks `data-z10-agent-editable`) vs at checksum/diff time. During execution is safer, at diff time is simpler.

2. **happy-dom Web Component support**: happy-dom has custom element support but may have gaps. Need to verify shadow DOM, `observedAttributes`, `attributeChangedCallback` all work. Fallback: linkedom or a thin polyfill layer.

3. **Statement boundary detection**: acorn can parse complete statements, but some edge cases (multi-line template literals, async/await) need careful handling. May need to buffer until a complete AST node is detected.

4. **CLI session persistence**: Should session state persist across CLI invocations (e.g., `z10 exec` in one Bash call, then another `z10 exec` in a separate call)? Options: daemon process, file-based state, or require `z10 page load` before each `z10 exec`.
