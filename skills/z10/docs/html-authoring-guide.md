# z10 HTML Authoring Guide

How to write HTML that z10 understands — producing correct node types in the canvas and a clean, readable layer tree in the left pane.

## How z10 reads your HTML

z10 infers three things from every element:

1. **Node type** — `frame`, `text`, `element`, or `component` — determines behavior (drag targets, text editing, selection)
2. **Display name** — shown in the layers panel tree
3. **Hierarchy** — parent/child nesting = tree structure

No special attributes are needed for type detection. z10 reads native HTML semantics: tag names, `style.display`, CSS class names, and child elements. Components are detected via `data-z10-component`.

---

## Node type detection rules

### Frame (container/layout)
Detected when **any** of these are true:
- `style="display: flex"` or `display: grid` (also `inline-flex`, `inline-grid`)
- Class name contains `flex` or `grid` (e.g. Tailwind `flex`, `grid`, `inline-flex`)
- Structural tag **with children**: `<div>`, `<section>`, `<article>`, `<aside>`, `<main>`, `<nav>`, `<header>`, `<footer>`, `<form>`, `<ul>`, `<ol>`, `<figure>`, `<fieldset>`, `<table>`
- Any element with child elements
- Custom elements (tag name contains `-`)

### Text
Detected when:
- Text-semantic tag: `<p>`, `<span>`, `<h1>`–`<h6>`, `<a>`, `<label>`, `<blockquote>`, `<code>`, `<pre>`, `<li>`
- OR: leaf element (no z10-tracked children) with text content

### Element (atomic)
Everything else: `<img>`, `<input>`, `<button>` (without children), `<svg>`, empty `<div>`s, etc.

### Component
Any element with `data-z10-component="ComponentName"`. The component name becomes the layer name and it shows with a diamond icon.

---

## Naming rules for the layers panel

Names are resolved in this priority order:

| Priority | Source | Example | Display name |
|----------|--------|---------|-------------|
| 1 | `data-z10-page` | `data-z10-page="Dashboard"` | Dashboard |
| 2 | `data-z10-component` | `data-z10-component="MetricCard"` | MetricCard |
| 3 | `data-z10-id` | `data-z10-id="sidebar_nav"` | Sidebar Nav |
| 4 | Semantic tag | `<nav>` | Nav |
| 5 | Text content (< 40 chars) | `<p>Welcome back</p>` | "Welcome back" |
| 6 | Tag name | `<div>` | div |

**ID conversion**: `snake_case`, `camelCase`, and `kebab-case` are all converted to Title Case.

**Component naming**: When `data-z10-component` is present, the component name is always used as the display name (overrides `data-z10-id`).

---

## Components (reusable elements)

Any element that appears more than once — or could appear more than once — should be defined as a component. Components give you:
- Consistent structure across all instances
- Configurable props per instance (text, variants, states)
- A clean layers panel with diamond icons and the component name

### How components work in z10

A component has two parts:

1. **Definition** — three blocks in `<head>` that describe the component's schema, styles, and template
2. **Instances** — elements in `<body>` that reference the definition by name

### Defining a component

Each component definition lives in `<head>` as three blocks:

**1. Metadata** — the component's name, props, and variants:
```html
<script type="application/z10+json" data-z10-role="component">
{
  "name": "MetricCard",
  "description": "KPI metric card with label, value, and change indicator",
  "props": [
    { "name": "label", "type": "string", "required": true, "description": "Metric label" },
    { "name": "value", "type": "string", "required": true, "description": "Metric value" },
    { "name": "change", "type": "string", "default": "", "description": "Change percentage" },
    { "name": "trend", "type": "enum", "options": ["up", "down", "neutral"], "default": "neutral", "description": "Trend direction for color" }
  ],
  "variants": [
    { "name": "default", "props": { "label": "Metric", "value": "0", "change": "+0%", "trend": "neutral" } },
    { "name": "positive", "props": { "label": "Revenue", "value": "$48,352", "change": "+12.5%", "trend": "up" } },
    { "name": "negative", "props": { "label": "Churn", "value": "2.4%", "change": "-0.8%", "trend": "down" } }
  ]
}
</script>
```

**2. Styles** — scoped CSS for the component:
```html
<style data-z10-component-styles="MetricCard">
  .metric-card { display: flex; flex-direction: column; gap: 8px; padding: 20px; background: var(--color-white); border-radius: 12px; border: 1px solid var(--color-gray-200); }
  .metric-label { font-size: 13px; color: var(--color-gray-500); margin: 0; }
  .metric-value { font-size: 28px; font-weight: 700; color: var(--color-gray-900); margin: 0; letter-spacing: -0.025em; }
  .metric-change { font-size: 13px; margin: 0; }
  .metric-change.up { color: var(--color-green-500); }
  .metric-change.down { color: var(--color-red-500); }
  .metric-change.neutral { color: var(--color-gray-400); }
</style>
```

**3. Template** — HTML with `{{propName}}` placeholders:
```html
<template data-z10-template="MetricCard">
  <div class="metric-card">
    <p class="metric-label">{{label}}</p>
    <p class="metric-value">{{value}}</p>
    <p class="metric-change {{trend}}">{{change}}</p>
  </div>
</template>
```

### Using a component (instances)

Place instances in `<body>` with `data-z10-component` and `data-z10-props`:

```html
<div data-z10-id="revenue_card"
     data-z10-component="MetricCard"
     data-z10-props='{"label":"Total Revenue","value":"$48,352","change":"+12.5%","trend":"up"}'>
</div>
```

- `data-z10-component="MetricCard"` — links to the definition by name
- `data-z10-props='...'` — JSON string of instance-specific prop values
- `data-z10-id` — still required for unique identity in the DOM
- The element itself is empty — the template system fills it at runtime

### Prop types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Any text value | `{ "name": "label", "type": "string" }` |
| `number` | Numeric value | `{ "name": "count", "type": "number", "default": 0 }` |
| `boolean` | True/false toggle | `{ "name": "disabled", "type": "boolean", "default": false }` |
| `enum` | One of a fixed set | `{ "name": "size", "type": "enum", "options": ["sm", "md", "lg"], "default": "md" }` |
| `slot` | Child content slot | `{ "name": "icon", "type": "slot" }` |

### Variants

Variants are named presets of prop values. They serve as starting points in the design tool — a designer picks a variant and then optionally overrides individual props:

```json
"variants": [
  {
    "name": "primary",
    "props": { "variant": "primary", "label": "Submit" },
    "styles": { "background": "var(--color-blue-600)" }
  },
  {
    "name": "secondary",
    "props": { "variant": "secondary", "label": "Cancel" },
    "styles": { "background": "var(--color-white)" }
  }
]
```

### When to make something a component

| Pattern | Component? | Why |
|---------|-----------|-----|
| Metric cards (4 of them in a row) | Yes | Same structure, different data |
| Nav links (5 in sidebar) | Yes | Same structure, different label/href/active state |
| Activity items in a list | Yes | Same structure, different content |
| Top bar (appears once) | No | Unique, no reuse |
| Page title (appears once) | No | Single text element |
| Chart card (2 similar ones) | Yes | Same card chrome, different title/content |

**Rule of thumb**: If you're copy-pasting a group of elements and only changing text/colors, it should be a component.

### How components appear in the layers panel

```
Metrics Row                    (frame)
  ├── MetricCard               (component) ← diamond icon, name from data-z10-component
  ├── MetricCard               (component)
  ├── MetricCard               (component)
  └── MetricCard               (component)
```

Each instance shows the component name. The `data-z10-id` is used internally for selection/addressing but the display name comes from the component name.

---

## Authoring principles

### 1. Every meaningful element gets a `data-z10-id`
IDs become layer names. Use descriptive snake_case names that read well as titles:
- `sidebar_nav` → **Sidebar Nav**
- `submit_button` → **Submit Button**
- `revenue_chart` → **Revenue Chart**
- `user_avatar` → **User Avatar**

### 2. Use semantic HTML tags
They provide both correct node type detection AND good fallback names:
- `<nav>` → type: frame, name: "Nav"
- `<header>` → type: frame, name: "Header"
- `<main>` → type: frame, name: "Main"
- `<section>` → type: frame, name: "Section"
- `<footer>` → type: frame, name: "Footer"

### 3. Layout containers MUST have flex/grid display
A `<div>` with no display style and no children = `element` (not a frame).
Always declare the layout mode:

```html
<!-- GOOD: z10 sees this as a frame -->
<div data-z10-id="card_row" style="display: flex; gap: 16px;">

<!-- BAD: z10 sees this as an element (if empty) or infers from children -->
<div data-z10-id="card_row">
```

### 4. Use inline styles for layout properties
z10 reads `el.style.display` directly. Tailwind classes also work because z10 regex-matches class names for `flex`/`grid`:

```html
<!-- Both work -->
<div style="display: flex; ..." >
<div class="flex gap-4 ..." >
```

### 5. Text content goes in text-semantic tags
Wrap all visible text in `<p>`, `<span>`, `<h1>`–`<h6>`, `<a>`, or `<label>`:

```html
<!-- GOOD: detected as text, shows content in layers -->
<h2 data-z10-id="page_title">Dashboard</h2>
<p data-z10-id="welcome_message">Welcome back, Sarah</p>

<!-- BAD: div with text is ambiguous -->
<div>Dashboard</div>
```

### 6. Leaf elements are atomic
`<img>`, `<button>` (without children), `<input>`, `<svg>` are detected as `element` type. Give them descriptive IDs:

```html
<img data-z10-id="user_avatar" src="..." alt="User avatar" />
<button data-z10-id="submit_button">Submit</button>
```

### 7. Build a logical hierarchy
The DOM tree = the layers tree. Structure your nesting to reflect the visual hierarchy a designer would expect:

```
Page 1
  ├── Top Bar           (header, flex)
  │   ├── Logo          (element)
  │   └── User Menu     (frame, flex)
  ├── Sidebar Nav       (nav, flex column)
  │   ├── NavItem       (component)
  │   └── NavItem       (component)
  └── Main Content      (main, flex column)
      ├── Page Title     (text)
      └── Card Grid      (frame, grid)
          ├── MetricCard (component)
          └── MetricCard (component)
```

### 8. Extract repeated elements into components
Any group of elements that appears more than once with the same structure but different data should be a component. This keeps the layers panel clean and the HTML DRY.

---

## Example: Analytics Dashboard

This example demonstrates all the principles above including components. Repeated elements (metric cards, nav items, activity items) are defined as components. Unique sections use regular semantic HTML.

### Expected layers panel output

```
Dashboard                          (page)
  ├── App Shell                    (frame)
  │   ├── Sidebar                  (frame)
  │   │   ├── Logo                 (frame)
  │   │   │   ├── Logo Icon        (element)
  │   │   │   └── "Acme Analytics" (text)
  │   │   ├── Sidebar Nav          (frame)
  │   │   │   ├── NavItem          (component)
  │   │   │   ├── NavItem          (component)
  │   │   │   ├── NavItem          (component)
  │   │   │   ├── NavItem          (component)
  │   │   │   └── NavItem          (component)
  │   │   └── User Profile         (frame)
  │   │       ├── Avatar           (element)
  │   │       └── "Sarah Chen"     (text)
  │   └── Main Area                (frame)
  │       ├── Top Bar              (frame)
  │       │   ├── "Dashboard"      (text)
  │       │   ├── Search Box       (frame)
  │       │   │   ├── Search Icon  (element)
  │       │   │   └── Search Input (element)
  │       │   └── Actions          (frame)
  │       │       ├── ActionButton  (component)
  │       │       └── ActionButton  (component)
  │       ├── Metrics Row          (frame)
  │       │   ├── MetricCard       (component)
  │       │   ├── MetricCard       (component)
  │       │   ├── MetricCard       (component)
  │       │   └── MetricCard       (component)
  │       ├── Charts Row           (frame)
  │       │   ├── Chart Card       (frame)
  │       │   │   ├── "Revenue Over Time" (text)
  │       │   │   └── Chart Area   (element)
  │       │   └── Chart Card       (frame)
  │       │       ├── "Traffic Sources"   (text)
  │       │       └── Chart Area   (element)
  │       └── Recent Activity      (frame)
  │           ├── "Recent Activity"     (text)
  │           └── Activity List         (frame)
  │               ├── ActivityItem      (component)
  │               ├── ActivityItem      (component)
  │               └── ActivityItem      (component)
```

### HTML

```html
<html data-z10-project="analytics-dashboard">
<head>
  <script type="application/z10+json" data-z10-role="config">
  {
    "name": "analytics-dashboard",
    "version": "1.0.0",
    "governance": { "level": 1 }
  }
  </script>

  <!-- ===== DESIGN TOKENS ===== -->
  <style data-z10-tokens="primitives">
    :root {
      --color-white: #ffffff;
      --color-black: #000000;
      --color-gray-50: #fafafa;
      --color-gray-100: #f4f4f5;
      --color-gray-200: #e4e4e7;
      --color-gray-300: #d4d4d8;
      --color-gray-400: #a1a1aa;
      --color-gray-500: #71717a;
      --color-gray-600: #52525b;
      --color-gray-700: #3f3f46;
      --color-gray-800: #27272a;
      --color-gray-900: #18181b;
      --color-blue-500: #3b82f6;
      --color-blue-600: #2563eb;
      --color-green-500: #22c55e;
      --color-red-500: #ef4444;
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 16px;
      --spacing-lg: 24px;
      --spacing-xl: 32px;
      --spacing-2xl: 48px;
      --size-sm: 12px;
      --size-md: 14px;
      --size-lg: 16px;
      --size-xl: 20px;
      --size-2xl: 24px;
      --size-3xl: 30px;
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
    }
  </style>

  <!-- ===== COMPONENT: NavItem ===== -->
  <script type="application/z10+json" data-z10-role="component">
  {
    "name": "NavItem",
    "description": "Sidebar navigation link",
    "props": [
      { "name": "label", "type": "string", "required": true },
      { "name": "href", "type": "string", "default": "#" },
      { "name": "active", "type": "boolean", "default": false }
    ],
    "variants": [
      { "name": "default", "props": { "label": "Link", "active": false } },
      { "name": "active", "props": { "label": "Link", "active": true } }
    ]
  }
  </script>
  <style data-z10-component-styles="NavItem">
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; font-size: 14px; text-decoration: none; color: var(--color-gray-400); }
    .nav-item.active { background-color: rgba(255,255,255,0.1); color: var(--color-white); font-weight: 500; }
  </style>
  <template data-z10-template="NavItem">
    <a class="nav-item {{active}}" href="{{href}}">{{label}}</a>
  </template>

  <!-- ===== COMPONENT: MetricCard ===== -->
  <script type="application/z10+json" data-z10-role="component">
  {
    "name": "MetricCard",
    "description": "KPI card with label, value, and change indicator",
    "props": [
      { "name": "label", "type": "string", "required": true },
      { "name": "value", "type": "string", "required": true },
      { "name": "change", "type": "string", "default": "" },
      { "name": "trend", "type": "enum", "options": ["up", "down", "neutral"], "default": "neutral" }
    ],
    "variants": [
      { "name": "positive", "props": { "label": "Revenue", "value": "$48,352", "change": "+12.5%", "trend": "up" } },
      { "name": "negative", "props": { "label": "Churn", "value": "2.4%", "change": "-0.8%", "trend": "down" } },
      { "name": "neutral", "props": { "label": "Metric", "value": "0", "change": "0%", "trend": "neutral" } }
    ]
  }
  </script>
  <style data-z10-component-styles="MetricCard">
    .metric-card { display: flex; flex-direction: column; gap: 8px; padding: 20px; background: var(--color-white); border-radius: 12px; border: 1px solid var(--color-gray-200); }
    .metric-label { font-size: 13px; color: var(--color-gray-500); margin: 0; }
    .metric-value { font-size: 28px; font-weight: 700; color: var(--color-gray-900); margin: 0; letter-spacing: -0.025em; }
    .metric-change { font-size: 13px; margin: 0; }
    .metric-change.up { color: var(--color-green-500); }
    .metric-change.down { color: var(--color-red-500); }
    .metric-change.neutral { color: var(--color-gray-400); }
  </style>
  <template data-z10-template="MetricCard">
    <div class="metric-card">
      <p class="metric-label">{{label}}</p>
      <p class="metric-value">{{value}}</p>
      <p class="metric-change {{trend}}">{{change}}</p>
    </div>
  </template>

  <!-- ===== COMPONENT: ActionButton ===== -->
  <script type="application/z10+json" data-z10-role="component">
  {
    "name": "ActionButton",
    "description": "Toolbar action button",
    "props": [
      { "name": "label", "type": "string", "required": true },
      { "name": "variant", "type": "enum", "options": ["primary", "secondary"], "default": "secondary" }
    ],
    "variants": [
      { "name": "primary", "props": { "label": "Action", "variant": "primary" } },
      { "name": "secondary", "props": { "label": "Action", "variant": "secondary" } }
    ]
  }
  </script>
  <style data-z10-component-styles="ActionButton">
    .action-btn { padding: 8px 16px; border-radius: 8px; font-size: 14px; cursor: pointer; }
    .action-btn.primary { border: none; background-color: var(--color-blue-600); color: var(--color-white); font-weight: 500; }
    .action-btn.secondary { border: 1px solid var(--color-gray-200); background-color: var(--color-white); color: var(--color-gray-700); }
  </style>
  <template data-z10-template="ActionButton">
    <button class="action-btn {{variant}}">{{label}}</button>
  </template>

  <!-- ===== COMPONENT: ActivityItem ===== -->
  <script type="application/z10+json" data-z10-role="component">
  {
    "name": "ActivityItem",
    "description": "Single row in the activity feed",
    "props": [
      { "name": "description", "type": "string", "required": true },
      { "name": "time", "type": "string", "required": true },
      { "name": "amount", "type": "string", "required": true },
      { "name": "trend", "type": "enum", "options": ["up", "down"], "default": "up" }
    ],
    "variants": [
      { "name": "income", "props": { "description": "New subscription", "time": "2m ago", "amount": "+$49.00", "trend": "up" } },
      { "name": "expense", "props": { "description": "Refund processed", "time": "1h ago", "amount": "-$29.00", "trend": "down" } }
    ]
  }
  </script>
  <style data-z10-component-styles="ActivityItem">
    .activity-item { display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--color-gray-100); }
    .activity-item:last-child { border-bottom: none; }
    .activity-info { display: flex; flex-direction: column; gap: 2px; }
    .activity-desc { font-size: 14px; color: var(--color-gray-800); margin: 0; }
    .activity-time { font-size: 12px; color: var(--color-gray-400); margin: 0; }
    .activity-amount { font-size: 14px; font-weight: 600; margin: 0; }
    .activity-amount.up { color: var(--color-green-500); }
    .activity-amount.down { color: var(--color-red-500); }
  </style>
  <template data-z10-template="ActivityItem">
    <div class="activity-item">
      <div class="activity-info">
        <p class="activity-desc">{{description}}</p>
        <p class="activity-time">{{time}}</p>
      </div>
      <p class="activity-amount {{trend}}">{{amount}}</p>
    </div>
  </template>

</head>
<body>
  <div data-z10-page="Dashboard" data-z10-id="dashboard" style="position: relative;">

    <!-- App Shell: sidebar + main -->
    <div data-z10-id="app_shell" style="position: absolute; left: 0px; top: 0px; width: 1440px; height: 900px; display: flex; flex-direction: row; background-color: var(--color-gray-50); overflow: hidden;">

      <!-- ===== SIDEBAR ===== -->
      <aside data-z10-id="sidebar" style="display: flex; flex-direction: column; width: 240px; background-color: var(--color-gray-900); padding: 24px 16px; justify-content: space-between;">

        <!-- Logo (unique — not a component) -->
        <div data-z10-id="logo" style="display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 0 8px 24px 8px;">
          <svg data-z10-id="logo_icon" width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#3b82f6"/>
            <path d="M8 20V12L14 8L20 12V20L14 16L8 20Z" fill="white"/>
          </svg>
          <span data-z10-id="logo_text" style="font-size: 18px; font-weight: 700; color: var(--color-white); letter-spacing: -0.025em;">Acme Analytics</span>
        </div>

        <!-- Navigation — each link is a NavItem component -->
        <nav data-z10-id="sidebar_nav" style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
          <div data-z10-id="nav_dashboard" data-z10-component="NavItem" data-z10-props='{"label":"Dashboard","href":"#","active":true}'></div>
          <div data-z10-id="nav_analytics" data-z10-component="NavItem" data-z10-props='{"label":"Analytics","href":"#"}'></div>
          <div data-z10-id="nav_customers" data-z10-component="NavItem" data-z10-props='{"label":"Customers","href":"#"}'></div>
          <div data-z10-id="nav_reports" data-z10-component="NavItem" data-z10-props='{"label":"Reports","href":"#"}'></div>
          <div data-z10-id="nav_settings" data-z10-component="NavItem" data-z10-props='{"label":"Settings","href":"#"}'></div>
        </nav>

        <!-- User profile (unique — not a component) -->
        <div data-z10-id="user_profile" style="display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 12px 8px; border-top: 1px solid rgba(255,255,255,0.1);">
          <img data-z10-id="avatar" src="https://i.pravatar.cc/32?u=sarah" alt="Avatar" width="32" height="32" style="border-radius: 50%;"/>
          <span data-z10-id="user_name" style="font-size: 14px; color: var(--color-gray-300);">Sarah Chen</span>
        </div>

      </aside>

      <!-- ===== MAIN AREA ===== -->
      <main data-z10-id="main_area" style="display: flex; flex-direction: column; flex: 1; overflow-y: auto;">

        <!-- Top Bar -->
        <header data-z10-id="top_bar" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 16px 32px; border-bottom: 1px solid var(--color-gray-200); background-color: var(--color-white);">
          <h1 data-z10-id="page_title" style="font-size: 20px; font-weight: 700; color: var(--color-gray-900); letter-spacing: -0.025em; margin: 0;">Dashboard</h1>

          <!-- Search (unique — not a component) -->
          <div data-z10-id="search_box" style="display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid var(--color-gray-200); border-radius: 8px; background-color: var(--color-gray-50); width: 280px;">
            <svg data-z10-id="search_icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="#a1a1aa" stroke-width="1.5"/>
              <line x1="11" y1="11" x2="14" y2="14" stroke="#a1a1aa" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input data-z10-id="search_input" type="text" placeholder="Search..." style="border: none; outline: none; background: transparent; font-size: 14px; color: var(--color-gray-600); width: 100%;"/>
          </div>

          <!-- Action buttons — each is an ActionButton component -->
          <div data-z10-id="actions" style="display: flex; flex-direction: row; align-items: center; gap: 8px;">
            <div data-z10-id="export_button" data-z10-component="ActionButton" data-z10-props='{"label":"Export","variant":"secondary"}'></div>
            <div data-z10-id="new_report_button" data-z10-component="ActionButton" data-z10-props='{"label":"New Report","variant":"primary"}'></div>
          </div>
        </header>

        <!-- Scrollable content area -->
        <div data-z10-id="content" style="display: flex; flex-direction: column; gap: 24px; padding: 32px;">

          <!-- ===== METRICS ROW — each card is a MetricCard component ===== -->
          <div data-z10-id="metrics_row" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
            <div data-z10-id="revenue_card" data-z10-component="MetricCard" data-z10-props='{"label":"Total Revenue","value":"$48,352","change":"+12.5%","trend":"up"}'></div>
            <div data-z10-id="users_card" data-z10-component="MetricCard" data-z10-props='{"label":"Active Users","value":"2,847","change":"+5.2%","trend":"up"}'></div>
            <div data-z10-id="orders_card" data-z10-component="MetricCard" data-z10-props='{"label":"Orders","value":"1,432","change":"-2.1%","trend":"down"}'></div>
            <div data-z10-id="conversion_card" data-z10-component="MetricCard" data-z10-props='{"label":"Conversion Rate","value":"3.24%","change":"+0.8%","trend":"up"}'></div>
          </div>

          <!-- ===== CHARTS ROW — unique layout, not componentized ===== -->
          <div data-z10-id="charts_row" style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px;">
            <div data-z10-id="revenue_chart" style="display: flex; flex-direction: column; gap: 16px; padding: 20px; background-color: var(--color-white); border-radius: 12px; border: 1px solid var(--color-gray-200);">
              <h2 data-z10-id="revenue_chart_title" style="font-size: 16px; font-weight: 600; color: var(--color-gray-900); margin: 0;">Revenue Over Time</h2>
              <div data-z10-id="revenue_chart_area" style="height: 240px; background-color: var(--color-gray-50); border-radius: 8px;"></div>
            </div>
            <div data-z10-id="traffic_chart" style="display: flex; flex-direction: column; gap: 16px; padding: 20px; background-color: var(--color-white); border-radius: 12px; border: 1px solid var(--color-gray-200);">
              <h2 data-z10-id="traffic_chart_title" style="font-size: 16px; font-weight: 600; color: var(--color-gray-900); margin: 0;">Traffic Sources</h2>
              <div data-z10-id="traffic_chart_area" style="height: 240px; background-color: var(--color-gray-50); border-radius: 8px;"></div>
            </div>
          </div>

          <!-- ===== RECENT ACTIVITY — items are ActivityItem components ===== -->
          <section data-z10-id="recent_activity" style="display: flex; flex-direction: column; gap: 16px; padding: 20px; background-color: var(--color-white); border-radius: 12px; border: 1px solid var(--color-gray-200);">
            <h2 data-z10-id="activity_title" style="font-size: 16px; font-weight: 600; color: var(--color-gray-900); margin: 0;">Recent Activity</h2>
            <div data-z10-id="activity_list" style="display: flex; flex-direction: column; gap: 0;">
              <div data-z10-id="activity_1" data-z10-component="ActivityItem" data-z10-props='{"description":"New subscription — Pro Plan","time":"2 minutes ago","amount":"+$49.00","trend":"up"}'></div>
              <div data-z10-id="activity_2" data-z10-component="ActivityItem" data-z10-props='{"description":"Payment received — Invoice #4821","time":"15 minutes ago","amount":"+$199.00","trend":"up"}'></div>
              <div data-z10-id="activity_3" data-z10-component="ActivityItem" data-z10-props='{"description":"Refund processed — Order #3847","time":"1 hour ago","amount":"-$29.00","trend":"down"}'></div>
            </div>
          </section>

        </div>
      </main>
    </div>
  </div>
</body>
</html>
```

---

## Quick checklist for agents

Before generating z10 HTML, verify:

- [ ] Every layout container has `display: flex` or `display: grid` in its inline style
- [ ] Every meaningful element has a `data-z10-id` with a descriptive snake_case name
- [ ] Text content is wrapped in semantic tags (`<p>`, `<h1>`–`<h6>`, `<span>`, `<a>`, `<label>`)
- [ ] Semantic HTML tags are used where appropriate (`<nav>`, `<header>`, `<main>`, `<section>`, `<aside>`, `<footer>`, `<form>`)
- [ ] The DOM hierarchy mirrors the visual hierarchy a designer would expect
- [ ] The page wrapper uses `data-z10-page="Page Name"` and `data-z10-id`
- [ ] The root frame has `position: absolute` with explicit width/height
- [ ] Design tokens from `<style data-z10-tokens="primitives">` are used via `var(--token-name)` where possible
- [ ] No orphan text — all text is inside a text-semantic tag, not floating in a `<div>`
- [ ] Any element appearing 2+ times is extracted into a component definition
- [ ] Component definitions have all three blocks in `<head>`: metadata JSON, styles, template
- [ ] Component instances use `data-z10-component` and `data-z10-props` with valid JSON
- [ ] Component props use appropriate types (`string`, `number`, `boolean`, `enum`)
- [ ] Components have meaningful variants that represent real use cases

## Common mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `<div>Hello</div>` | Detected as text (ambiguous), bad name | `<p data-z10-id="greeting">Hello</p>` |
| `<div style="gap: 16px;">` without `display: flex` | Not a frame — gap has no effect | Add `display: flex` |
| `data-z10-id="div1"` | Layer name: "Div1" — meaningless | Use descriptive: `"metric_card"` |
| Deeply nested anonymous divs | Layer tree full of "div" entries | Add IDs or use semantic tags |
| `<button><span>Save</span></button>` | Button becomes a frame (has child) | Fine structurally, but consider if the span needs its own ID |
| Missing `data-z10-page` on page wrapper | No page node in tree | Add `data-z10-page="Page Name"` |
| Copy-pasting 4 metric cards | Bloated HTML, inconsistent changes | Define a MetricCard component |
| `data-z10-props="label: Revenue"` | Props must be valid JSON string | `data-z10-props='{"label":"Revenue"}'` |
| Component without all 3 head blocks | Component won't render or style properly | Add metadata JSON + styles + template |
| Variant with no real-world meaning | Useless in design tool | Name variants after actual use cases: "primary", "active", "income" |
