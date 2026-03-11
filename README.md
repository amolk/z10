# Zero-10 (z10)

Branchable UI evolution for the agent era.

Zero-10 is a design tool built on annotated web standards. Its `.z10.html` file format uses `data-z10-*` attributes and `<script type="application/z10+json">` metadata over standard HTML/CSS, enabling AI coding agents to read and write UI designs natively through a token-efficient MCP protocol.

## Quick Start

```bash
npm install
npm run build

# Create a new design file
z10 new "My App"

# Start the MCP server
z10 serve my-app.z10.html

# Connect Claude Code
claude mcp add zero10 --transport http http://127.0.0.1:29910/mcp --scope user
```

## CLI Reference

```
z10 new [name]                          Create a new .z10.html file
z10 serve [file] [--port N]             Start MCP server (default: 29910)
z10 info <file>                         Show document summary
z10 config <file> [key] [value]         Get/set configuration
z10 branch [name]                       Create/list design branches
z10 diff <ref1>..<ref2>                 Semantic diff between Git refs
z10 merge <branch> [--into <target>]    Merge a design branch
z10 sync --design <file>                Check design sync status
```

### Configuration

```bash
# Show all config
z10 config app.z10.html

# Get a single value
z10 config app.z10.html governance

# Set a value
z10 config app.z10.html governance scoped-edit
```

Config keys: `name`, `version`, `governance` (full-edit | propose-approve | scoped-edit), `defaultMode` (light | dark).

### Design Branches

Zero-10 uses Git-native branching with a `z10/` prefix:

```bash
z10 branch "dark-mode-exploration"       # Creates z10/dark-mode-exploration
z10 branch                               # Lists all z10/* branches
z10 diff main..z10/dark-mode-exploration # Semantic node-level diff
z10 merge dark-mode-exploration --into main
```

## MCP Server

The MCP server exposes 19 tools for AI agents to read and modify `.z10.html` documents.

### Connection

| Client | Command |
|--------|---------|
| Claude Code | `claude mcp add zero10 --transport http http://127.0.0.1:29910/mcp --scope user` |
| Cursor | `cursor://settings/mcp?name=zero10&url=http://127.0.0.1:29910/mcp` |
| Any HTTP MCP client | `http://127.0.0.1:29910/mcp` |

### Read Tools

| Tool | Purpose |
|------|---------|
| `get_project_summary` | Component inventory, tokens, pages, config |
| `get_component_props(name)` | Props schema for a component |
| `get_node_info(id)` | Full node details by ID |
| `get_tree(id?, depth?)` | Subtree hierarchy (compact text) |
| `get_styles(id)` | Computed CSS for a node |
| `get_tokens(collection?)` | Design token values |
| `get_guide(topic?)` | Contextual help for agents |

### Write Tools (12 Primitives)

| Tool | Purpose |
|------|---------|
| `z10.node(id, opts)` | Create container element |
| `z10.text(id, opts)` | Create text element |
| `z10.instance(id, opts)` | Instantiate a component |
| `z10.repeat(id, opts)` | Generate repeated elements with faker data |
| `z10.style(id, props)` | Update CSS properties (merge semantics) |
| `z10.move(id, opts)` | Move/reorder in tree |
| `z10.remove(id)` | Remove node and children |
| `z10.component(name, schema)` | Define/update component |
| `z10.tokens(collection, vars)` | Add/update design tokens |
| `z10.batch(commands[])` | Multiple commands atomically |
| `z10.attr(id, attrs)` | Set HTML/data attributes |
| `write_html(id, html)` | Raw HTML fallback |

### Agent Governance

Three levels control what agents can edit:

- **full-edit** (default): Agent writes directly. Every edit appears immediately.
- **propose-approve**: Agent writes to staging. Designer accepts/rejects per change.
- **scoped-edit**: Agent can only edit nodes with `data-z10-agent-editable="true"`.

Set via `z10 config <file> governance <level>` or in the config script block.

## File Format

A `.z10.html` file is valid HTML:

```html
<html data-z10-project="My App">
<head>
  <script type="application/z10+json" data-z10-role="config">
    { "name": "My App", "version": "1.0.0", "governance": "full-edit", "defaultMode": "light" }
  </script>
  <style data-z10-tokens="primitives">
    :root { --blue-500: #3b82f6; --gray-900: #111827; }
  </style>
  <style data-z10-tokens="semantic">
    :root { --primary: var(--blue-500); --text: var(--gray-900); }
  </style>

  <!-- Component: script (metadata) + style + template -->
  <script type="application/z10+json" data-z10-role="component">
    { "name": "Button", "props": [...], "variants": [...] }
  </script>
  <style data-z10-component-styles="Button">.btn { ... }</style>
  <template data-z10-template="Button"><button class="btn">{{label}}</button></template>
</head>
<body>
  <div data-z10-page="Dashboard" data-z10-mode="light">
    <div data-z10-id="header" data-z10-intent="layout" style="display:flex;">
      ...
    </div>
  </div>
</body>
</html>
```

Key attributes:
- `data-z10-id` — Stable node identifier (survives edits, used for diffing/matching)
- `data-z10-intent` — Semantic intent: layout, design, decoration, content, interaction, code-region
- `data-z10-editor` — Who last edited: designer, agent, developer
- `data-z10-agent-editable` — Per-node agent governance override
- `data-z10-component` — Component name for instances
- `data-z10-page` / `data-z10-mode` — Page containers with display mode

## Runtime

The Z10 runtime handles template instantiation, faker data, and mode switching. It's included as a library module — the file renders basic HTML without it, but component instances don't expand.

### Faker Data

Seeded by node ID for stable values across reloads. Used in `z10.repeat`:

```
z10.repeat("card_grid_item", {
  parent: "card_grid", count: 12, component: "Card",
  props: {
    title: { faker: "company.name" },
    subtitle: { faker: "company.catchPhrase" },
    price: { faker: "finance.price" }
  }
})
```

Supported categories: `person`, `company`, `lorem`, `date`, `number`, `image`, `address`, `finance`, `color`, `phone`, `internet`.

### Mode Switching

Pages support light/dark modes via the `data-z10-mode` attribute. The runtime provides programmatic switching and mode-aware token resolution.

## Architecture

```
src/
├── core/
│   ├── types.ts       # Type definitions (Z10Document, Z10Node, Z10Command, etc.)
│   ├── document.ts    # Document model operations
│   ├── commands.ts    # 12 command executors with governance checks
│   └── config.ts      # Configuration validation and management
├── format/
│   ├── parser.ts      # .z10.html → Z10Document
│   └── serializer.ts  # Z10Document → .z10.html
├── runtime/
│   ├── faker.ts       # Seeded fake data (40+ generators)
│   ├── template.ts    # Component template instantiation
│   └── modes.ts       # Light/dark mode switching
├── mcp/
│   ├── tools.ts       # MCP tool definitions and handlers
│   └── server.ts      # HTTP MCP server (Streamable HTTP transport)
└── cli/
    ├── index.ts       # CLI entry point (serve, new, info, config)
    └── git.ts         # Git commands (branch, diff, merge, sync)
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests (208 tests, ~250ms)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
npm run lint         # Type-check only
```

Zero runtime dependencies beyond `@modelcontextprotocol/sdk`. TypeScript strict mode, ES2022 modules, Vitest for testing.

## License

MIT
