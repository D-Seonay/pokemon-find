import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rateLimit.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createRateLimiter", () => {
  it("laisse passer jusqu'à la limite", () => {
    const allow = createRateLimiter(3, 1000);
    expect([allow("a"), allow("a"), allow("a")]).toEqual([true, true, true]);
    expect(allow("a")).toBe(false);
  });

  it("compte séparément chaque clé", () => {
    const allow = createRateLimiter(1, 1000);
    expect(allow("a")).toBe(true);
    expect(allow("b")).toBe(true);
    expect(allow("a")).toBe(false);
  });

  it("libère après la fenêtre glissante", () => {
    const allow = createRateLimiter(1, 1000);
    expect(allow("a")).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(allow("a")).toBe(true);
  });

  it("repart de zéro pour une clé libérée explicitement via release()", () => {
    const allow = createRateLimiter(1, 1000);
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    allow.release("a");
    expect(allow("a")).toBe(true);
  });

  it("release() n'affecte pas les autres clés", () => {
    const allow = createRateLimiter(1, 1000);
    expect(allow("a")).toBe(true);
    expect(allow("b")).toBe(true);
    allow.release("a");
    expect(allow("b")).toBe(false);
  });
});
