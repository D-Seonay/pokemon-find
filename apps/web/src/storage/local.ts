export const KEYS = {
  nickname: "pkfind.nickname.v1",
  best: "pkfind.best.v1",
  daily: "pkfind.daily.v1",
  dailyHistory: "pkfind.daily-history.v1",
  soloHistory: "pkfind.solo-history.v1",
  session: "pkfind.session.v1",
} as const;

type Kind = "local" | "session";

function storageOf(kind: Kind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T, kind: Kind = "local"): T {
  try {
    const raw = storageOf(kind)?.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, kind: Kind = "local"): void {
  try {
    storageOf(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    // Mode privé, quota atteint : le jeu doit rester jouable sans stockage.
  }
}

export function removeKey(key: string, kind: Kind = "local"): void {
  try {
    storageOf(kind)?.removeItem(key);
  } catch {
    // idem
  }
}
