/**
 * Checksum computation for DOM sync.
 *
 * Computes a hash of serialized HTML to detect drift between
 * the local happy-dom state and the server state.
 */

import { createHash } from 'node:crypto';

export function computeChecksum(html: string): string {
  return createHash('sha256').update(html).digest('hex').slice(0, 16);
}

export function checksumsMatch(local: string, remote: string): boolean {
  return local === remote;
}
