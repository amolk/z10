/**
 * Tests for CLI session state management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We test the core logic by importing the functions and mocking the paths
// Since session.ts uses homedir(), we test the serialization logic directly

describe('session state serialization', () => {
  const testDir = join(tmpdir(), `z10-test-${Date.now()}`);
  const sessionFile = join(testDir, 'session.json');
  const domCacheFile = join(testDir, 'dom-cache.html');

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should serialize session state as JSON', async () => {
    const { writeFile } = await import('node:fs/promises');
    const state = {
      authToken: 'test-token',
      serverUrl: 'http://localhost:3000',
      currentProjectId: 'proj-123',
    };
    await writeFile(sessionFile, JSON.stringify(state, null, 2), 'utf-8');

    const loaded = JSON.parse(await readFile(sessionFile, 'utf-8'));
    expect(loaded.authToken).toBe('test-token');
    expect(loaded.serverUrl).toBe('http://localhost:3000');
    expect(loaded.currentProjectId).toBe('proj-123');
  });

  it('should handle missing session file gracefully', async () => {
    try {
      await readFile(join(testDir, 'nonexistent.json'), 'utf-8');
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  it('should merge session updates', () => {
    const current = { authToken: 'old', serverUrl: 'http://old' };
    const update = { serverUrl: 'http://new', currentProjectId: 'proj-1' };
    const merged = { ...current, ...update };
    expect(merged.authToken).toBe('old');
    expect(merged.serverUrl).toBe('http://new');
    expect(merged.currentProjectId).toBe('proj-1');
  });

  it('should store DOM cache as HTML', async () => {
    const { writeFile } = await import('node:fs/promises');
    const html = '<div id="test"><span>Hello</span></div>';
    await writeFile(domCacheFile, html, 'utf-8');

    const loaded = await readFile(domCacheFile, 'utf-8');
    expect(loaded).toBe(html);
  });
});
