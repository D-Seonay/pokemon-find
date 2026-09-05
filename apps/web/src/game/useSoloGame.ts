import {
  type GameSettings,
  type Pool,
  buildPool,
  pickTargets,
  rngFromSeed,
  scoreForAnswer,
} from "@pkfind/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const SOLO_REVEAL_MS = 3000;

export type SoloPhase = "round" | "reveal" | "finished";

export type SoloRound = {
  targetId: number;
  answerId: number | null;
  points: number;
  responseTimeMs: number | null;
};

export type SoloGame = {
  phase: SoloPhase;
  roundIndex: number;
  roundCount: number;
  targetId: number;
  remainingMs: number;
  totalScore: number;
  rounds: SoloRound[];
  pool: Pool;
  answer: (pokemonId: number) => void;
  skipReveal: () => void;
};

export function useSoloGame(settings: GameSettings, seed: string): SoloGame {
  const pool = useMemo(() => buildPool(settings.generations), [settings.generations]);
  const targets = useMemo(
    () => pickTargets(pool.ids, settings.roundCount, rngFromSeed(seed)),
    [pool, settings.roundCount, seed],
  );

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<SoloPhase>("round");
  const [rounds, setRounds] = useState<SoloRound[]>([]);
  const [deadline, setDeadline] = useState(() => Date.now() + settings.roundDurationMs);
  const [now, setNow] = useState(() => Date.now());

  const answered = useRef(false);
  const roundStartedAt = useRef(Date.now());

  const finishRound = useCallback(
    (answerId: number | null) => {
      if (answered.current) return;
      answered.current = true;
      const targetId = targets[index]!;
      const at = Date.now();
      setRounds((list) => [
        ...list,
        {
          targetId,
          answerId,
          points: scoreForAnswer(targetId, answerId, pool.span),
          responseTimeMs: answerId === null ? null : at - roundStartedAt.current,
        },
      ]);
      setDeadline(at + SOLO_REVEAL_MS);
      setNow(at);
      setPhase("reveal");
    },
    [index, pool.span, targets],
  );

  const advance = useCallback(() => {
    const next = index + 1;
    if (next >= targets.length) {
      setPhase("finished");
      return;
    }
    const at = Date.now();
    answered.current = false;
    roundStartedAt.current = at;
    setIndex(next);
    setDeadline(at + settings.roundDurationMs);
    setNow(at);
    setPhase("round");
  }, [index, settings.roundDurationMs, targets.length]);

  useEffect(() => {
    if (phase === "finished") return undefined;
    const handle = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(handle);
  }, [phase]);

  useEffect(() => {
    if (now < deadline) return;
    if (phase === "round") finishRound(null);
    else if (phase === "reveal") advance();
  }, [advance, deadline, finishRound, now, phase]);

  return {
    phase,
    roundIndex: index,
    roundCount: targets.length,
    targetId: targets[index] ?? targets[targets.length - 1]!,
    remainingMs: phase === "round" ? Math.max(0, deadline - now) : 0,
    totalScore: rounds.reduce((sum, round) => sum + round.points, 0),
    rounds,
    pool,
    answer: finishRound,
    skipReveal: () => {
      if (phase === "reveal") advance();
    },
  };
}
