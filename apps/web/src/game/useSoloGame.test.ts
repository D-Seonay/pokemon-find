import { DEFAULT_SETTINGS, buildPool, pickTargets, rngFromSeed } from "@pkfind/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOLO_REVEAL_MS, useSoloGame } from "./useSoloGame.js";

const SEED = "solo:test";
const targets = pickTargets(
  buildPool(DEFAULT_SETTINGS.generations).ids,
  DEFAULT_SETTINGS.roundCount,
  rngFromSeed(SEED),
);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useSoloGame", () => {
  it("démarre sur la manche 1 avec la première cible de la graine", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    expect(result.current.phase).toBe("round");
    expect(result.current.roundIndex).toBe(0);
    expect(result.current.targetId).toBe(targets[0]);
    expect(result.current.remainingMs).toBe(DEFAULT_SETTINGS.roundDurationMs);
  });

  it("marque 1000 points pour une réponse exacte et passe en révélation", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    act(() => result.current.answer(targets[0]!));
    expect(result.current.phase).toBe("reveal");
    expect(result.current.totalScore).toBe(1000);
    expect(result.current.rounds[0]?.points).toBe(1000);
    expect(result.current.rounds[0]?.answerId).toBe(targets[0]);
  });

  it("enchaîne automatiquement après la révélation", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    act(() => result.current.answer(targets[0]!));
    advance(SOLO_REVEAL_MS + 100);
    expect(result.current.phase).toBe("round");
    expect(result.current.roundIndex).toBe(1);
    expect(result.current.targetId).toBe(targets[1]);
  });

  it("permet de passer la révélation immédiatement", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    act(() => result.current.answer(targets[0]!));
    act(() => result.current.skipReveal());
    expect(result.current.roundIndex).toBe(1);
  });

  it("compte zéro quand le chrono expire sans réponse", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    advance(DEFAULT_SETTINGS.roundDurationMs + 200);
    expect(result.current.phase).toBe("reveal");
    expect(result.current.rounds[0]).toMatchObject({
      answerId: null,
      points: 0,
      responseTimeMs: null,
    });
  });

  it("ignore une seconde réponse dans la même manche", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    act(() => result.current.answer(targets[0]!));
    act(() => result.current.answer(targets[1]!));
    expect(result.current.rounds).toHaveLength(1);
  });

  it("termine après le nombre de manches configuré", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    for (let i = 0; i < DEFAULT_SETTINGS.roundCount; i++) {
      act(() => result.current.answer(result.current.targetId));
      advance(SOLO_REVEAL_MS + 100);
    }
    expect(result.current.phase).toBe("finished");
    expect(result.current.rounds).toHaveLength(DEFAULT_SETTINGS.roundCount);
    expect(result.current.totalScore).toBe(1000 * DEFAULT_SETTINGS.roundCount);
  });

  it("ne tire jamais deux fois la même cible", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    const seen: number[] = [];
    for (let i = 0; i < DEFAULT_SETTINGS.roundCount; i++) {
      seen.push(result.current.targetId);
      act(() => result.current.answer(result.current.targetId));
      advance(SOLO_REVEAL_MS + 100);
    }
    expect(new Set(seen).size).toBe(DEFAULT_SETTINGS.roundCount);
  });
});
