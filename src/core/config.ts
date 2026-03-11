/**
 * Configuration management for Z10 projects.
 *
 * Handles validation, updating, and loading of project configuration.
 * Config is stored in the .z10.html file's config script block and
 * optionally in a standalone z10.config.json file.
 */

import type { ProjectConfig, GovernanceLevel, DisplayMode, Z10Document } from './types.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_GOVERNANCE: GovernanceLevel[] = ['full-edit', 'propose-approve', 'scoped-edit'];
const VALID_MODES: DisplayMode[] = ['light', 'dark'];

export interface ConfigValidationError {
  field: string;
  message: string;
  value: unknown;
}

/**
 * Validate a full or partial project configuration.
 * Returns an array of validation errors (empty = valid).
 */
export function validateConfig(config: Partial<ProjectConfig>): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (config.name !== undefined) {
    if (typeof config.name !== 'string' || config.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Project name must be a non-empty string', value: config.name });
    }
    if (typeof config.name === 'string' && config.name.length > 100) {
      errors.push({ field: 'name', message: 'Project name must be 100 characters or fewer', value: config.name });
    }
  }

  if (config.version !== undefined) {
    if (typeof config.version !== 'string' || config.version.trim().length === 0) {
      errors.push({ field: 'version', message: 'Version must be a non-empty string', value: config.version });
    }
  }

  if (config.governance !== undefined) {
    if (!VALID_GOVERNANCE.includes(config.governance)) {
      errors.push({
        field: 'governance',
        message: `Governance must be one of: ${VALID_GOVERNANCE.join(', ')}`,
        value: config.governance,
      });
    }
  }

  if (config.defaultMode !== undefined) {
    if (!VALID_MODES.includes(config.defaultMode)) {
      errors.push({
        field: 'defaultMode',
        message: `Default mode must be one of: ${VALID_MODES.join(', ')}`,
        value: config.defaultMode,
      });
    }
  }

  return errors;
}

/**
 * Check if a config is valid.
 */
export function isValidConfig(config: Partial<ProjectConfig>): boolean {
  return validateConfig(config).length === 0;
}

// ---------------------------------------------------------------------------
// Config updates
// ---------------------------------------------------------------------------

/**
 * Update document configuration with validation.
 * Only updates fields that are present in the update object.
 *
 * @returns Array of validation errors, or empty array on success
 */
export function updateConfig(
  doc: Z10Document,
  update: Partial<ProjectConfig>,
): ConfigValidationError[] {
  const errors = validateConfig(update);
  if (errors.length > 0) return errors;

  if (update.name !== undefined) doc.config.name = update.name;
  if (update.version !== undefined) doc.config.version = update.version;
  if (update.governance !== undefined) doc.config.governance = update.governance;
  if (update.defaultMode !== undefined) doc.config.defaultMode = update.defaultMode;

  return [];
}

/**
 * Get a single config value by key.
 */
export function getConfigValue(doc: Z10Document, key: keyof ProjectConfig): string {
  return doc.config[key];
}

/**
 * Set a single config value by key, with validation.
 *
 * @returns Validation error message, or null on success
 */
export function setConfigValue(
  doc: Z10Document,
  key: keyof ProjectConfig,
  value: string,
): string | null {
  const update: Partial<ProjectConfig> = {};

  switch (key) {
    case 'name':
      update.name = value;
      break;
    case 'version':
      update.version = value;
      break;
    case 'governance':
      update.governance = value as GovernanceLevel;
      break;
    case 'defaultMode':
      update.defaultMode = value as DisplayMode;
      break;
    default:
      return `Unknown config key: ${key}`;
  }

  const errors = updateConfig(doc, update);
  if (errors.length > 0) return errors[0]!.message;
  return null;
}

// ---------------------------------------------------------------------------
// Standalone config file support (z10.config.json)
// ---------------------------------------------------------------------------

/** Shape of a z10.config.json file */
export interface Z10ConfigFile {
  name?: string;
  version?: string;
  governance?: GovernanceLevel;
  defaultMode?: DisplayMode;
  server?: {
    port?: number;
  };
  fonts?: string[];
}

/**
 * Parse a z10.config.json file contents.
 * Returns the parsed config or null if invalid JSON.
 */
export function parseConfigFile(json: string): Z10ConfigFile | null {
  try {
    return JSON.parse(json) as Z10ConfigFile;
  } catch {
    return null;
  }
}

/**
 * Serialize a config file to JSON.
 */
export function serializeConfigFile(config: Z10ConfigFile): string {
  return JSON.stringify(config, null, 2) + '\n';
}

/**
 * Merge a config file into a document's config.
 * Config file values are applied as defaults (don't override existing values
 * unless they match the document defaults).
 */
export function applyConfigFile(doc: Z10Document, configFile: Z10ConfigFile): ConfigValidationError[] {
  const update: Partial<ProjectConfig> = {};

  if (configFile.name !== undefined) update.name = configFile.name;
  if (configFile.version !== undefined) update.version = configFile.version;
  if (configFile.governance !== undefined) update.governance = configFile.governance;
  if (configFile.defaultMode !== undefined) update.defaultMode = configFile.defaultMode;

  return updateConfig(doc, update);
}

/**
 * Extract a config file object from a document's current config.
 */
export function extractConfigFile(doc: Z10Document): Z10ConfigFile {
  return {
    name: doc.config.name,
    version: doc.config.version,
    governance: doc.config.governance,
    defaultMode: doc.config.defaultMode,
  };
}

// ---------------------------------------------------------------------------
// Config key enumeration (for CLI help)
// ---------------------------------------------------------------------------

export const CONFIG_KEYS: Array<{ key: keyof ProjectConfig; description: string; validValues?: string }> = [
  { key: 'name', description: 'Project name' },
  { key: 'version', description: 'Project version' },
  { key: 'governance', description: 'Agent governance level', validValues: VALID_GOVERNANCE.join(', ') },
  { key: 'defaultMode', description: 'Default display mode', validValues: VALID_MODES.join(', ') },
];
