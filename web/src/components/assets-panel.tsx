"use client";

import { useState, useMemo } from "react";
import { useEditor, type LayerNode } from "@/lib/editor-state";
import { COMPONENT_COLOR } from "@/lib/editor-constants";
import { Diamond, Search } from "lucide-react";
import { toTagName } from "z10/core";
import { parseComponentTemplates } from "@/lib/z10-dom";
import { inferNodeType } from "@/lib/node-inference";
import { LayerRow } from "@/components/layers-panel";

/**
 * Component library browser.
 * Shows registered Web Components like pages — each with selectable state
 * and element hierarchy underneath.
 */
export function AssetsPanel() {
  const {
    componentList,
    editingComponentName,
    enterComponentEditMode,
    content,
    componentSchemas,
  } = useEditor();
  const [layerSearch, setLayerSearch] = useState("");

  // Components are always shown (no search filtering on the component list itself)

  // Parse the selected component's template into a layer tree for the hierarchy view.
  // IDs are generated deterministically (cmp-<Name>-<n>) to match the canvas DOM.
  const componentLayers = useMemo(() => {
    if (!editingComponentName || !content) return [];
    const templates = parseComponentTemplates(content);
    const tmpl = templates.get(editingComponentName);
    if (!tmpl?.template) return [];

    try {
      // Build default props (same logic as ComponentPreview)
      const schema = componentSchemas.get(editingComponentName);
      const props: Record<string, unknown> = {};
      if (schema) {
        for (const p of schema.props) {
          props[p.name] = p.default ?? p.name;
        }
        if (schema.variants.length > 0) {
          Object.assign(props, schema.variants[0]!.props);
        }
      }

      // Expand template: handle {{#prop}}...{{/prop}} blocks, then {{prop}}
      let expanded = tmpl.template;
      expanded = expanded.replace(
        /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
        (_m, propName, content) => (props[propName] ? content : ""),
      );
      expanded = expanded.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
        const val = props[name];
        return val != null ? String(val) : name;
      });

      const parser = new DOMParser();
      const doc = parser.parseFromString(
        `<div>${expanded}</div>`,
        "text/html",
      );
      const wrapper = doc.body.firstElementChild as HTMLElement;
      if (!wrapper) return [];

      const ctx = { counter: 0 };
      const nodes: LayerNode[] = [];
      for (const child of Array.from(wrapper.children)) {
        if (child instanceof HTMLElement) {
          if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
          nodes.push(
            templateElementToNode(child, 1, editingComponentName, ctx),
          );
        }
      }
      return nodes;
    } catch {
      return [];
    }
  }, [editingComponentName, content]);

  const filteredLayers = layerSearch
    ? filterNodes(componentLayers, layerSearch.toLowerCase())
    : componentLayers;

  return (
    <div className="flex h-full flex-col" style={{ color: "var(--ed-text)" }}>
      {/* Component list (like pages) */}
      <div className="border-b" style={{ borderColor: "var(--ed-section-border)" }}>
        {componentList.length === 0 ? (
          <div
            className="px-3 py-6 text-center text-[11px]"
            style={{ color: "var(--ed-text-tertiary)" }}
          >
            No components registered. Use z10 component create to add one.
          </div>
        ) : (
          componentList.map((name) => (
            <button
              key={name}
              onClick={() => enterComponentEditMode(name)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors"
              style={{
                backgroundColor:
                  editingComponentName === name
                    ? "var(--ed-selected-bg)"
                    : "transparent",
                color:
                  editingComponentName === name
                    ? "var(--ed-selected-text)"
                    : "var(--ed-text)",
              }}
              title={`Edit component, or use: z10 exec to create <${toTagName(name)}>`}
            >
              <Diamond
                size={14}
                strokeWidth={1}
                style={{
                  color:
                    editingComponentName === name
                      ? "var(--ed-selected-text)"
                      : COMPONENT_COLOR,
                  flexShrink: 0,
                }}
              />
              <span className="truncate">{name}</span>
            </button>
          ))
        )}
      </div>

      {/* Search layers within component */}
      {editingComponentName && componentLayers.length > 0 && (
        <>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Search
                size={14}
                strokeWidth={1}
                style={{
                  color: "var(--ed-icon-color)",
                  flexShrink: 0,
                }}
              />
              <input
                type="text"
                placeholder="Search layers..."
                value={layerSearch}
                onChange={(e) => setLayerSearch(e.target.value)}
                className="w-full bg-transparent text-[12px] placeholder:text-[var(--ed-text-tertiary)] focus:outline-none"
                style={{ color: "var(--ed-text)" }}
              />
            </div>
          </div>
          <div
            className="border-b"
            style={{ borderColor: "var(--ed-section-border)" }}
          />
        </>
      )}

      {/* Element hierarchy */}
      <div className="flex-1 overflow-y-auto py-0.5" style={{ minHeight: 0 }}>
        {editingComponentName && filteredLayers.length > 0 ? (
          filteredLayers.map((node) => (
            <LayerRow key={node.id} node={node} />
          ))
        ) : editingComponentName ? (
          <div
            className="px-3 py-4 text-center text-[12px]"
            style={{ color: "var(--ed-text-tertiary)" }}
          >
            No layers in component
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Template HTML → LayerNode converter ─────────────────────

const SEMANTIC_TAG_NAMES: Record<string, string> = {
  NAV: "Nav",
  HEADER: "Header",
  MAIN: "Main",
  SECTION: "Section",
  ASIDE: "Aside",
  ARTICLE: "Article",
  FOOTER: "Footer",
  FORM: "Form",
  UL: "List",
  OL: "List",
  BUTTON: "Button",
  INPUT: "Input",
  IMG: "Image",
  SVG: "Vector",
  TABLE: "Table",
};

function filterNodes(nodes: LayerNode[], search: string): LayerNode[] {
  const result: LayerNode[] = [];
  for (const node of nodes) {
    const filteredChildren = filterNodes(node.children, search);
    if (
      node.name.toLowerCase().includes(search) ||
      node.id.toLowerCase().includes(search) ||
      filteredChildren.length > 0
    ) {
      result.push({ ...node, children: filteredChildren });
    }
  }
  return result;
}

function templateElementToNode(
  el: HTMLElement,
  depth: number,
  componentName: string,
  ctx: { counter: number },
): LayerNode {
  const id =
    el.getAttribute("data-z10-id") || `cmp-${componentName}-${++ctx.counter}`;

  const z10Id = el.getAttribute("data-z10-id");
  let name: string;
  if (z10Id && !z10Id.startsWith("cmp-")) {
    // Use human-authored IDs as display names
    name = z10Id
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } else {
    // Synthetic cmp- IDs or no ID: derive name from tag
    name =
      SEMANTIC_TAG_NAMES[el.tagName] || el.tagName.toLowerCase();
  }

  const type = inferNodeType(el);

  const children: LayerNode[] = [];
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement) {
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
      children.push(templateElementToNode(child, depth + 1, componentName, ctx));
    }
  }

  return { id, name, tag: el.tagName.toLowerCase(), type, children, depth };
}
