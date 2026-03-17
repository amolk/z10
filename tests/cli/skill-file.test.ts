/**
 * E1. Tests for the z10 skill file (agent system prompt).
 *
 * Validates that the skill file:
 * - Does NOT reference obsolete concepts (statement-by-statement, checksums, Z10Command, STALE_DOM)
 * - DOES reference the new collaborative DOM model (sandbox, transaction, ticket, conflict)
 * - Correctly documents restricted attributes (data-z10-id, data-z10-ts-*)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('E1 skill file accuracy', () => {
  let content: string;

  beforeAll(() => {
    const skillPath = resolve(__dirname, '../../skills/z10/SKILL.md');
    content = readFileSync(skillPath, 'utf-8');
  });

  describe('obsolete concepts are removed', () => {
    it('should not reference statement-by-statement execution', () => {
      expect(content).not.toMatch(/statement.by.statement/i);
      expect(content).not.toMatch(/each statement executes/i);
      expect(content).not.toMatch(/one line per statement/i);
      expect(content).not.toMatch(/\d+ statements,.*passed/);
    });

    it('should not reference checksum-based sync', () => {
      expect(content).not.toMatch(/checksum/i);
    });

    it('should not reference STALE_DOM error', () => {
      expect(content).not.toMatch(/STALE_DOM/);
    });

    it('should not reference acorn or statement parsing', () => {
      expect(content).not.toMatch(/acorn/i);
      expect(content).not.toMatch(/parser expects complete statements/i);
    });

    it('should not reference the old Z10Command model', () => {
      expect(content).not.toMatch(/Z10Command/);
      expect(content).not.toMatch(/Z10Document/);
      expect(content).not.toMatch(/Z10Node/);
      expect(content).not.toMatch(/12 command types/i);
      expect(content).not.toMatch(/12 primitives/i);
    });
  });

  describe('new collaborative DOM model is documented', () => {
    it('should describe atomic/single-block execution', () => {
      expect(content).toMatch(/atomic/i);
    });

    it('should describe the sandboxed document', () => {
      expect(content).toMatch(/sandbox/i);
      expect(content).toMatch(/scoped/i);
    });

    it('should mention transaction concept', () => {
      expect(content).toMatch(/transaction/i);
    });

    it('should document conflict-based error recovery', () => {
      expect(content).toMatch(/conflict/i);
      expect(content).toMatch(/rejected/i);
    });

    it('should document that data-z10-id is read-only for agents', () => {
      // Must mention data-z10-id as stable identifier with read-only access
      expect(content).toMatch(/data-z10-id/);
      expect(content).toMatch(/read only/i);
    });

    it('should document that data-z10-ts-* must not be touched', () => {
      expect(content).toMatch(/data-z10-ts-\*/);
      expect(content).toMatch(/do not touch|do not modify/i);
    });

    it('should document illegal attribute modification error', () => {
      expect(content).toMatch(/illegal modification/i);
    });

    it('should document txId in success output', () => {
      expect(content).toMatch(/txId/);
    });
  });

  describe('core API documentation is preserved', () => {
    it('should document DOM query methods', () => {
      expect(content).toMatch(/getElementById/);
      expect(content).toMatch(/querySelector/);
      expect(content).toMatch(/querySelectorAll/);
    });

    it('should document DOM mutation methods', () => {
      expect(content).toMatch(/createElement/);
      expect(content).toMatch(/appendChild/);
      expect(content).toMatch(/insertBefore/);
      expect(content).toMatch(/remove\(\)/);
    });

    it('should document style manipulation', () => {
      expect(content).toMatch(/style\.padding/);
      expect(content).toMatch(/style\.display/);
      expect(content).toMatch(/setProperty/);
    });

    it('should document Web Components', () => {
      expect(content).toMatch(/HTMLElement/);
      expect(content).toMatch(/customElements\.define/);
      expect(content).toMatch(/z10Props/);
    });

    it('should document design tokens', () => {
      expect(content).toMatch(/z10\.setTokens/);
    });

    it('should document governance', () => {
      expect(content).toMatch(/data-z10-agent-editable/);
      expect(content).toMatch(/GOVERNANCE_DENIED/);
    });

    it('should document z10 exec command', () => {
      expect(content).toMatch(/z10 exec/);
    });

    it('should document z10 dom command', () => {
      expect(content).toMatch(/z10 dom/);
    });
  });
});
