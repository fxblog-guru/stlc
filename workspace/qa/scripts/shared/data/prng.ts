// prng.ts — the seeded random source for generated inputs (fuzz/openapi-fuzz.ts) and generated action
// sequences (model/model-runner.ts). Same seed → same inputs → the failure replays exactly: every
// failure message prints the seed (QA_FUZZ_SEED / QA_MODEL_SEED). Never Math.random() in a test.
// mulberry32: tiny, fast, good enough for test-input selection (not for anything cryptographic).

/** A stream seed for one label under one run seed — removing an operation never shifts another's inputs. */
export function streamSeed(seed: number, label: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export class Prng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** a float in [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** an integer in [min, max] */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** true with probability p */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('prng.pick: empty list');
    return items[this.int(0, items.length - 1)];
  }

  /** a shuffled copy (Fisher–Yates) */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** at most `n` items, order kept — the budget cut when a generator yields more than allowed */
  sample<T>(items: readonly T[], n: number): T[] {
    if (items.length <= n) return [...items];
    const keep = new Set(this.shuffle(items.map((_, i) => i)).slice(0, n));
    return items.filter((_, i) => keep.has(i));
  }

  /** a v4-shaped uuid drawn from this stream — an id that exists nowhere, reproducibly */
  uuid(): string {
    const hex = Array.from({ length: 32 }, () => this.int(0, 15).toString(16));
    hex[12] = '4';
    hex[16] = ((this.int(0, 3) & 0x3) | 0x8).toString(16);
    const h = hex.join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}
