import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { TransactionEngine } from '../../src/dom/transaction.js';
import { LamportClock } from '../../src/dom/clock.js';
import { bootstrapDocument } from '../../src/dom/bootstrap.js';
import { buildManifest } from '../../src/dom/validator.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

describe('TransactionEngine', () => {
  function setup(html: string) {
    document.body.innerHTML = html;
    const root = document.body as unknown as Element;
    const clock = new LamportClock();
    bootstrapDocument(root.firstElementChild as Element, clock);
    const engine = new TransactionEngine(root.firstElementChild as Element, clock);
    return { root: root.firstElementChild as Element, clock, engine };
  }

  it('commits a simple attribute change', async () => {
    const { root, engine } = setup('<div><span class="old">text</span></div>');
    const manifest = buildManifest(root);

    const rootNid = root.getAttribute('data-z10-id')!;
    const result = await engine.execute(
      `document.querySelector('span').setAttribute('class', 'new')`,
      rootNid,
      manifest,
    );

    expect(result.status).toBe('committed');
    if (result.status === 'committed') {
      expect(result.txId).toBeGreaterThan(0);
    }
  });

  it('commits a text content change', async () => {
    const { root, engine } = setup('<div><span>old text</span></div>');
    const manifest = buildManifest(root);

    const rootNid = root.getAttribute('data-z10-id')!;
    const result = await engine.execute(
      `document.querySelector('span').textContent = 'new text'`,
      rootNid,
      manifest,
    );

    expect(result.status).toBe('committed');
    // Verify the live DOM was updated
    const span = root.querySelector('span');
    expect(span!.textContent).toBe('new text');
  });

  it('rejects code that modifies data-z10-id', async () => {
    const { root, engine } = setup('<div><span>text</span></div>');
    const manifest = buildManifest(root);

    const rootNid = root.getAttribute('data-z10-id')!;
    const result = await engine.execute(
      `document.querySelector('span').setAttribute('data-z10-id', 'hacked')`,
      rootNid,
      manifest,
    );

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('illegal-modification');
    }
  });

  it('rejects code that modifies data-z10-ts-*', async () => {
    const { root, engine } = setup('<div><span>text</span></div>');
    const manifest = buildManifest(root);

    const rootNid = root.getAttribute('data-z10-id')!;
    const result = await engine.execute(
      `document.querySelector('span').setAttribute('data-z10-ts-node', '999')`,
      rootNid,
      manifest,
    );

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('illegal-modification');
    }
  });

  it('rejects code with execution errors', async () => {
    const { root, engine } = setup('<div><span>text</span></div>');
    const manifest = buildManifest(root);

    const rootNid = root.getAttribute('data-z10-id')!;
    const result = await engine.execute(
      `throw new Error('something went wrong')`,
      rootNid,
      manifest,
    );

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('execution-error');
    }
  });

  it('stores committed patches in ring buffer', async () => {
    const { root, engine } = setup('<div><span>text</span></div>');
    const manifest = buildManifest(root);

    const rootNid = root.getAttribute('data-z10-id')!;
    await engine.execute(
      `document.querySelector('span').textContent = 'updated'`,
      rootNid,
      manifest,
    );

    expect(engine.ringBuffer.size).toBeGreaterThanOrEqual(1);
  });

  it('increments clock on commit', async () => {
    const { root, engine, clock } = setup('<div><span>text</span></div>');
    const manifest = buildManifest(root);
    const initialClock = clock.value;

    const rootNid = root.getAttribute('data-z10-id')!;
    await engine.execute(
      `document.querySelector('span').textContent = 'updated'`,
      rootNid,
      manifest,
    );

    expect(clock.value).toBeGreaterThan(initialClock);
  });

  it('handles no-op code (no changes)', async () => {
    const { root, engine } = setup('<div><span>text</span></div>');
    const manifest = buildManifest(root);

    const rootNid = root.getAttribute('data-z10-id')!;
    const result = await engine.execute(
      `// no-op`,
      rootNid,
      manifest,
    );

    // No changes should still result in committed (empty patch)
    expect(result.status).toBe('committed');
  });
});
