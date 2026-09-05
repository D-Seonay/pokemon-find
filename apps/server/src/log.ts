import type { LogLevel } from "./config.js";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let threshold: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

function emit(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[threshold]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, data?: Record<string, unknown>) => emit("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
};
