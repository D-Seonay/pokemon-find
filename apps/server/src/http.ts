import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Config } from "./config.js";

const startedAt = Date.now();

export function createHttpApp(
  config: Config,
  stats: () => { rooms: number; players: number },
): express.Express {
  const app = express();

  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok", uptimeMs: Date.now() - startedAt, ...stats() });
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const webDir = resolve(here, config.webDir);
  const indexFile = join(webDir, "index.html");

  if (existsSync(webDir)) {
    app.use(
      "/assets",
      express.static(join(webDir, "assets"), {
        maxAge: "1y",
        immutable: true,
      }),
    );
    app.use(express.static(webDir, { index: false, maxAge: 0 }));
  }

  app.get("*", (_request, response) => {
    if (!existsSync(indexFile)) {
      response.status(404).type("text/plain").send("Front non construit");
      return;
    }
    response.set("Cache-Control", "no-cache").sendFile(indexFile);
  });

  return app;
}
