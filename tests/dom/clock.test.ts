import { describe, it, expect } from 'vitest';
import { LamportClock } from '../../src/dom/clock.js';

describe('LamportClock', () => {
  it('starts at 0 by default', () => {
    const clock = new LamportClock();
    expect(clock.value).toBe(0);
  });

  it('starts at custom initial value', () => {
    const clock = new LamportClock(42);
    expect(clock.value).toBe(42);
  });

  it('rejects negative initial values', () => {
    expect(() => new LamportClock(-1)).toThrow();
  });

  it('rejects non-integer initial values', () => {
    expect(() => new LamportClock(1.5)).toThrow();
  });

  it('tick() increments monotonically', () => {
    const clock = new LamportClock();
    expect(clock.tick()).toBe(1);
    expect(clock.tick()).toBe(2);
    expect(clock.tick()).toBe(3);
    expect(clock.value).toBe(3);
  });

  it('receive() advances past remote timestamp then ticks', () => {
    const clock = new LamportClock(5);
    // Remote is ahead: advance to 10, then tick to 11
    expect(clock.receive(10)).toBe(11);
    expect(clock.value).toBe(11);
  });

  it('receive() just ticks when local is ahead', () => {
    const clock = new LamportClock(10);
    // Remote is behind: stay at 10, tick to 11
    expect(clock.receive(5)).toBe(11);
    expect(clock.value).toBe(11);
  });

  it('receive() ticks when equal', () => {
    const clock = new LamportClock(5);
    expect(clock.receive(5)).toBe(6);
  });
});
