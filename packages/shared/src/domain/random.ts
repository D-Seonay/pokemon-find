export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: string): () => number {
  return mulberry32(fnv1a32(seed));
}

export function pickTargets(
  poolIds: readonly number[],
  count: number,
  rng: () => number,
): number[] {
  const a = [...poolIds];
  const n = Math.min(count, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    const swap = a[i]!;
    a[i] = a[j]!;
    a[j] = swap;
  }
  return a.slice(0, n);
}

export function randomSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `solo:${hex}`;
}
