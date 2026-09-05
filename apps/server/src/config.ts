export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Config = {
  port: number;
  nodeEnv: string;
  logLevel: LogLevel;
  corsOrigin: string;
  webDir: string;
  revealMs: number;
  countdownMs: number;
  answerGraceMs: number;
  reconnectGraceMs: number;
  roomEmptyTtlMs: number;
  roomMaxAgeMs: number;
  maxRooms: number;
};

function readInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${key} doit être un entier entre ${min} et ${max} (reçu "${raw}").`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const logLevel = env.LOG_LEVEL ?? "info";
  if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
    throw new ConfigError(`LOG_LEVEL doit valoir ${LOG_LEVELS.join(", ")} (reçu "${logLevel}").`);
  }
  return {
    port: readInt(env, "PORT", 3000, 1, 65535),
    nodeEnv: env.NODE_ENV ?? "production",
    logLevel: logLevel as LogLevel,
    corsOrigin: env.CORS_ORIGIN ?? "",
    webDir: env.WEB_DIR ?? "../../web/dist",
    countdownMs: readInt(env, "COUNTDOWN_MS", 3000, 100, 30_000),
    revealMs: readInt(env, "ROUND_REVEAL_MS", 6000, 100, 60_000),
    answerGraceMs: readInt(env, "ANSWER_GRACE_MS", 1500, 0, 10_000),
    reconnectGraceMs: readInt(env, "RECONNECT_GRACE_MS", 60_000, 1, 600_000),
    roomEmptyTtlMs: readInt(env, "ROOM_EMPTY_TTL_MS", 300_000, 1, 3_600_000),
    roomMaxAgeMs: readInt(env, "ROOM_MAX_AGE_MS", 10_800_000, 60_000, 86_400_000),
    maxRooms: readInt(env, "MAX_ROOMS", 500, 1, 10_000),
  };
}
