export const MAX_SCORE = 1000;
export const DECAY = 10;

export function gapBetween(targetId: number, answerId: number): number {
  return Math.abs(answerId - targetId);
}

export function scoreForAnswer(targetId: number, answerId: number | null, span: number): number {
  if (answerId === null) return 0;
  const gap = gapBetween(targetId, answerId);
  return Math.round(MAX_SCORE * Math.exp((-DECAY * gap) / span));
}
