/**
 * Core types for the Zero-10 document model.
 * Based on the .z10.html file format specification.
 */

// ---------------------------------------------------------------------------
// Node Identity & Metadata
// ---------------------------------------------------------------------------

/** Stable identifier for a node, persisted as data-z10-id in HTML */
export type NodeId = string;

/** Classification of how a node was created/modified */
export type NodeEditor = 'designer' | 'agent' | 'developer';

/** Semantic intent of a node, used for reconciliation classification */
export type NodeIntent = 'layout' | 'design' | 'decoration' | 'content' | 'interaction' | 'code-region';

/** Agent governance: which nodes agents can edit */
export type AgentEditable = boolean;

/** Agent governance levels */
export type GovernanceLevel = 'full-edit' | 'propose-approve' | 'scoped-edit';

// ---------------------------------------------------------------------------
// Design Tokens
// ---------------------------------------------------------------------------

/** Token collection type */
export type TokenCollection = 'primitives' | 'semantic';

/** A single design token (CSS custom property) */
export interface DesignToken {
  name: string;       // e.g. "--color-blue-500"
  value: string;      // e.g. "#3b82f6"
  collection: TokenCollection;
  description?: string;
}

/** A set of design tokens, grouped by collection */
export interface TokenSet {
  primitives: Map<string, DesignToken>;
  semantic: Map<string, DesignToken>;
}

// ---------------------------------------------------------------------------
// Component System
// ---------------------------------------------------------------------------

/** A prop definition in a component schema */
export interface ComponentProp {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'slot';
  default?: string | number | boolean;
  options?: string[];  // for enum type
  required?: boolean;
  description?: string;
}

/** A component variant */
export interface ComponentVariant {
  name: string;
  props: Record<string, string | number | boolean>;
  styles?: Record<string, string>;
}

/** Component definition schema */
export interface ComponentSchema {
  name: string;
  description?: string;
  props: ComponentProp[];
  variants: ComponentVariant[];
  slots?: string[];
  styles: string;       // CSS text for the component
  template: string;     // HTML template string
}

// ---------------------------------------------------------------------------
// Node Tree
// ---------------------------------------------------------------------------

/** CSS styles as a key-value map */
export type StyleMap = Record<string, string>;

/** A node in the Z10 document tree */
export interface Z10Node {
  id: NodeId;
  tag: string;               // HTML tag name
  parent: NodeId | null;      // null for root
  children: NodeId[];         // ordered child IDs
  styles: StyleMap;
  attributes: Record<string, string>;  // data-* and other HTML attributes
  textContent?: string;       // for text nodes
  intent: NodeIntent;
  editor: NodeEditor;
  agentEditable: AgentEditable;
  componentName?: string;     // if this is a component instance
  componentProps?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Display mode for a page */
export type DisplayMode = 'light' | 'dark';

/** A page in the document */
export interface Z10Page {
  name: string;
  rootNodeId: NodeId;
  mode: DisplayMode;
}

// ---------------------------------------------------------------------------
// Project Configuration
// ---------------------------------------------------------------------------

/** Project-level configuration stored in the config script block */
export interface ProjectConfig {
  name: string;
  version: string;
  governance: GovernanceLevel;
  defaultMode: DisplayMode;
}

// ---------------------------------------------------------------------------
// Document Model
// ---------------------------------------------------------------------------

/** The complete Z10 document — in-memory representation of a .z10.html file */
export interface Z10Document {
  config: ProjectConfig;
  tokens: TokenSet;
  components: Map<string, ComponentSchema>;
  nodes: Map<NodeId, Z10Node>;
  pages: Z10Page[];
}

