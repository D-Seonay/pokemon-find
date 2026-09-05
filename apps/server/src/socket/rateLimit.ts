export type RateLimiter = ((key: string) => boolean) & { release: (key: string) => void };

export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();

  function allow(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  }

  return Object.assign(allow, {
    release: (key: string): void => {
      hits.delete(key);
    },
  });
}
