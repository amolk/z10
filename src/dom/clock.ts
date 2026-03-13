/**
 * A1. Logical Clock — Monotonic Lamport counter.
 * Single integer, incremented per committed transaction. Pure class, no I/O.
 * §3.2: All timestamps are values from a monotonic logical clock.
 */

export class LamportClock {
  private _value: number;

  constructor(initialValue: number = 0) {
    if (!Number.isInteger(initialValue) || initialValue < 0) {
      throw new Error(`Clock value must be a non-negative integer, got ${initialValue}`);
    }
    this._value = initialValue;
  }

  /** Current clock value. */
  get value(): number {
    return this._value;
  }

  /** Increment clock and return the new value. Called once per committed transaction. */
  tick(): number {
    return ++this._value;
  }

  /** Update clock to be at least as large as the received timestamp, then tick. */
  receive(remoteTimestamp: number): number {
    if (remoteTimestamp > this._value) {
      this._value = remoteTimestamp;
    }
    return this.tick();
  }
}
