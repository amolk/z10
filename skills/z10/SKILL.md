---
name: z10
description: Use when working with z10 design tool CLI, editing designs via DOM APIs, executing JavaScript against z10 documents, handling STALE_DOM errors, setting design tokens, or defining reusable components
---

# z10 — AI Agent Design Tool

z10 is a design tool where AI agents edit designs using standard DOM APIs.
You write JavaScript; z10 executes it against the design document.

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

Pipe JavaScript via stdin to `z10 exec`. Each statement executes against the design DOM.

**Important:** Before creating HTML structures, refer to [docs/html-authoring-guide.md](docs/html-authoring-guide.md) for idiomatic patterns and best practices.

```bash
z10 exec <<'EOF'
const nav = document.getElementById('left-nav');
nav.style.padding = '16px';
const item = document.createElement('p');
item.setAttribute('data-z10-id', 'new_item');
item.textContent = 'New Item';
nav.appendChild(item);
EOF
```

**Output** — one line per statement:
```
✓ const nav = document.getElementById('left-nav');
✓ nav.style.padding = '16px';
✓ const item = document.createElement('p');
✓ item.setAttribute('data-z10-id', 'new_item');
✓ item.textContent = 'New Item';
✓ nav.appendChild(item);

6 statements, all passed
```

On error, the process exits immediately:
```
✓ const nav = document.getElementById('left-nav');
✗ nav.querySelector('.missing').remove();
  ERROR: Cannot read properties of null (reading 'remove')

2 statements, failed
```

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
element.innerHTML = '<p data-z10-id="welcome_text">Welcome back</p>'
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
element.setAttribute('data-z10-id', 'sidebar_nav')
element.id = 'sidebar'
```

## z10 Data Attributes

| Attribute | Purpose |
|-----------|---------|
| `data-z10-id` | Stable node identifier (also found by `getElementById`) |
| `data-z10-component` | Component type name |
| `data-z10-intent` | Layout intent: `layout`, `decoration`, `content`, `interaction` |
| `data-z10-editor` | Editor metadata (internal) |
| `data-z10-agent-editable` | Governance: which nodes the agent may edit |

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

Components are reusable elements with configurable props. Define them with three blocks in `<head>`, then instantiate in `<body>`.

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
bubble.setAttribute('data-z10-id', 'user_message');
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
// ✅ Add elements inside a top-level frame
document.getElementById('frame_page_1').appendChild(newElement);

// ✅ Adding a new top-level frame is the exception
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
container.setAttribute('data-z10-id', 'app_shell');
container.style.display = 'flex';
container.style.flexDirection = 'row';
container.style.gap = '16px';
container.style.padding = '24px';
const sidebar = document.createElement('aside');
sidebar.setAttribute('data-z10-id', 'sidebar');
sidebar.style.display = 'flex';
sidebar.style.flexDirection = 'column';
sidebar.style.width = '240px';
const main = document.createElement('main');
main.setAttribute('data-z10-id', 'main_content');
main.style.display = 'flex';
main.style.flexDirection = 'column';
main.style.flex = '1';
container.appendChild(sidebar);
container.appendChild(main);
document.getElementById('frame_page_1').appendChild(container);
EOF
```

## Error Recovery

### STALE_DOM
```
✗ nav.appendChild(newItem);
  ERROR: STALE_DOM — local and server checksums differ
```
Someone edited the design while you were working. Run `z10 dom` to refresh, re-read the DOM, then retry.

### Element not found
```
✗ document.getElementById('sidebar').style.padding = '8px';
  ERROR: Cannot read properties of null (reading 'style')
```
Run `z10 dom` to check correct IDs.

### Syntax error
```
Parse error: Unexpected token (line 3, col 12)
```
Check your JavaScript syntax. The parser expects complete statements.

## Governance

z10 enforces edit permissions via `data-z10-agent-editable`:
- **full-edit** (default): Agent can edit everything
- **scoped-edit**: Agent can only edit nodes with `data-z10-agent-editable="true"` or descendants
- **propose-approve**: Agent writes to staging branch, human reviews

If governance blocks an edit:
```
✗ protectedNode.remove();
  ERROR: GOVERNANCE_DENIED — node 'header' is not agent-editable
```
