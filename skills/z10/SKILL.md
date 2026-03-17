---
name: z10
description: Use when working with z10 design tool CLI, editing designs via DOM APIs, executing JavaScript against z10 documents, handling transaction conflicts, setting design tokens, or defining reusable components
---

# z10 — AI Agent Design Tool

z10 is a design tool where AI agents edit designs using standard DOM APIs.
You write JavaScript; z10 executes it as an atomic transaction against the design document in a sandboxed, scoped environment.

## Setup

```bash
z10 login --token <your-api-token>
z10 project load <project-id>
z10 page load <page-id>        # optional — scopes queries to one page
```

## Commands

| Command | Description |
|---------|-------------|
| `z10 login --token <token>` | Authenticate with z10 server |
| `z10 project load <id>` | Set current project (caches DOM locally) |
| `z10 page load <id>` | Set current page |
| `z10 dom` | Show compact DOM tree of current page |
| `z10 dom --full` | Show full HTML of current page |
| `z10 exec` | Execute JavaScript from stdin |
| `z10 components` | List registered Web Components |
| `z10 tokens` | List design tokens |

## Executing Code

Pipe JavaScript via stdin to `z10 exec`. Your code runs as a single atomic transaction against the canonical DOM in a sandboxed environment.

**Important:** Before creating HTML structures, refer to [docs/html-authoring-guide.md](docs/html-authoring-guide.md) for idiomatic patterns and best practices.

```bash
z10 exec <<'EOF'
const nav = document.getElementById('left-nav');
nav.style.padding = '16px';
const item = document.createElement('p');
item.textContent = 'New Item';
nav.appendChild(item);
EOF
```

**Output on success:**
```
✓ Executed (txId: 42)
<div data-z10-id="left-nav" style="padding: 16px;">...</div>
```

The server returns a txId confirming the transaction was committed.

**Output on error:**
```
✗ Execution rejected [execution-error]

  Your JavaScript threw an error or timed out during execution.
  Error: Cannot read properties of null (reading 'remove')
```

## Transaction Model

z10 uses a collaborative transaction model:

1. **Atomic execution**: Your entire script runs as one transaction — it either fully commits or is fully rejected.
2. **Sandboxed environment**: Code executes in a scoped sandbox against the server's canonical DOM.
3. **Conflict detection**: If another transaction modified the same elements since your last read, you get a conflict rejection.
4. **txId tracking**: Each successful commit returns a txId for ordering and deduplication.

## Data Attributes

| Attribute | Purpose | Agent access |
|-----------|---------|-------------|
| `data-z10-id` | Stable node identifier (also found by `getElementById`) | Read only — do not modify |
| `data-z10-ts-*` | Internal timestamp attributes for conflict detection | Do not touch — do not modify or remove |
| `data-z10-component` | Component type name | Read/write |
| `data-z10-intent` | Layout intent: `layout`, `decoration`, `content`, `interaction` | Read/write |
| `data-z10-editor` | Editor metadata (internal) | Read only |
| `data-z10-agent-editable` | Governance: which nodes the agent may edit | Read only |

**Critical**: `data-z10-id` is read only — the system assigns these. `data-z10-ts-*` attributes must not be touched; they are managed internally by the transaction engine.

## DOM API Reference

Use standard Web APIs — z10 runs a full DOM environment (happy-dom).

**z10 enhancement:** `document.getElementById(id)` also searches `data-z10-id` attributes, so you can use z10 node IDs directly.

### Query
```js
document.getElementById('left-nav')           // also matches data-z10-id
document.querySelector('[data-z10-component="Button"]')
document.querySelectorAll('.nav-item')
element.closest('.container')
element.children
element.parentElement
```

### Create & Mutate
```js
document.createElement('div')
parent.appendChild(child)
parent.insertBefore(newNode, refNode)
parent.removeChild(child)
element.remove()
element.cloneNode(true)
```

### Content
```js
element.textContent = 'Hello'
element.innerHTML = '<p>Welcome back</p>'
```

### Style
```js
element.style.padding = '8px'
element.style.display = 'flex'
element.style.gap = '12px'
element.style.setProperty('--custom-var', 'value')
```

### Attributes
```js
element.setAttribute('data-z10-intent', 'layout')
element.classList.add('active')
element.id = 'sidebar'
```

## Design Tokens

Set design tokens via the `z10` global:

```bash
z10 exec <<'EOF'
z10.setTokens('semantic', { '--color-primary': '#3b82f6', '--color-surface': '#f8fafc', '--spacing-md': '16px' });
z10.setTokens('primitives', { '--blue-500': '#3b82f6', '--gray-50': '#f8fafc' });
EOF
```

Reference tokens in styles:
```js
element.style.color = 'var(--color-primary)';
element.style.padding = 'var(--spacing-md)';
```

## Components

Components are reusable Web Components with configurable props. They extend HTMLElement and are registered via `customElements.define`. Each component declares static `z10Props` for the design tool property panel.

### Defining a component

A component requires three parts in `<head>`: metadata, styles, and template.

```bash
z10 exec <<'EOF'
// 1. Metadata — name, props, and variants
const meta = document.createElement('script');
meta.type = 'application/z10+json';
meta.setAttribute('data-z10-role', 'component');
meta.textContent = JSON.stringify({ name: 'ChatBubble', props: [{ name: 'content', type: 'string', required: true }, { name: 'variant', type: 'enum', options: ['sent', 'received'], default: 'received' }], variants: [{ name: 'sent', props: { content: 'Hello!', variant: 'sent' } }, { name: 'received', props: { content: 'Hi there', variant: 'received' } }] });
document.head.appendChild(meta);

// 2. Styles — scoped CSS
const styles = document.createElement('style');
styles.setAttribute('data-z10-component-styles', 'ChatBubble');
styles.textContent = '.bubble { padding: 12px; border-radius: 16px; margin: 0; } .sent { background: var(--color-primary); color: white; } .received { background: var(--color-surface); }';
document.head.appendChild(styles);

// 3. Template — HTML with {{propName}} placeholders
const template = document.createElement('template');
template.setAttribute('data-z10-template', 'ChatBubble');
template.innerHTML = '<p class="bubble {{variant}}">{{content}}</p>';
document.head.appendChild(template);
EOF
```

### Using a component (instances)

Instances go in `<body>` with `data-z10-component` and `data-z10-props`:

```bash
z10 exec <<'EOF'
const bubble = document.createElement('div');
bubble.setAttribute('data-z10-component', 'ChatBubble');
bubble.setAttribute('data-z10-props', '{"content":"Hello!","variant":"sent"}');
document.getElementById('chat_container').appendChild(bubble);
EOF
```

The element itself is empty — the template system fills it at render time.

### Prop types

| Type | Schema |
|------|--------|
| `string` | `{ name: 'label', type: 'string', required: true }` |
| `number` | `{ name: 'count', type: 'number', default: 0 }` |
| `boolean` | `{ name: 'active', type: 'boolean', default: false }` |
| `enum` | `{ name: 'size', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' }` |
| `slot` | `{ name: 'icon', type: 'slot' }` |

### When to use components

Any element appearing 2+ times with the same structure but different data should be a component:
- Metric cards in a dashboard row
- Nav items in a sidebar
- Activity items in a feed
- Action buttons in a toolbar

## Element Placement

Each page has top-level frame divs as direct children of `document.body`. Always add new elements inside a top-level frame, not directly on the body. Use `z10 dom` to find the frame IDs.

```js
// Add elements inside a top-level frame
document.getElementById('frame_page_1').appendChild(newElement);

// Adding a new top-level frame is the exception
document.body.appendChild(newFrame);
```

## Common Patterns

### Bulk modify
```bash
z10 exec <<'EOF'
for (const btn of document.querySelectorAll('[data-z10-component="Button"]')) { btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
EOF
```

### Build a layout
```bash
z10 exec <<'EOF'
const container = document.createElement('div');
container.style.display = 'flex';
container.style.flexDirection = 'row';
container.style.gap = '16px';
container.style.padding = '24px';
const sidebar = document.createElement('aside');
sidebar.style.display = 'flex';
sidebar.style.flexDirection = 'column';
sidebar.style.width = '240px';
const main = document.createElement('main');
main.style.display = 'flex';
main.style.flexDirection = 'column';
main.style.flex = '1';
container.appendChild(sidebar);
container.appendChild(main);
document.getElementById('frame_page_1').appendChild(container);
EOF
```

## Error Recovery

### Transaction rejected — conflict
```
✗ Execution rejected [conflict]

  The DOM was modified by another transaction since your last read.
  Conflict: {"type":"style-property","nid":"n1","property":"padding"}
```
Another transaction modified the same elements. Run `z10 dom` to get the latest state, then retry your operation.

### Transaction rejected — illegal modification
```
✗ Execution rejected [illegal-modification]

  Your code modified protected system attributes (data-z10-id or data-z10-ts-*).
```
Do not set or remove `data-z10-id` or `data-z10-ts-*` attributes. These are managed by the transaction engine. Illegal modification of system attributes will cause the transaction to be rejected.

### Transaction rejected — execution error
```
✗ Execution rejected [execution-error]

  Your JavaScript threw an error or timed out during execution.
  Error: Cannot read properties of null (reading 'style')
```
Run `z10 dom` to check correct IDs and element structure.

### Syntax error
```
✗ Execution rejected [execution-error]

  Error: SyntaxError: Unexpected token
```
Check your JavaScript syntax.

## Governance

z10 enforces edit permissions via `data-z10-agent-editable`:
- **full-edit** (default): Agent can edit everything
- **scoped-edit**: Agent can only edit nodes with `data-z10-agent-editable="true"` or descendants
- **propose-approve**: Agent writes to staging branch, human reviews

If governance blocks an edit:
```
✗ Execution rejected [execution-error]
  ERROR: GOVERNANCE_DENIED — node 'header' is not agent-editable
```
