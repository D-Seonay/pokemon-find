import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import type { Config } from "./config.js";

const startedAt = Date.now();

export function createHttpApp(
  config: Config,
  stats: () => { rooms: number; players: number },
): express.Express {
  const app = express();

  // Le bundle du front fait ~534 Ko bruts pour ~125 Ko compressés : sans ce middleware,
  // chaque joueur télécharge la version brute, y compris le dataset des 1025 Pokémon.
  // Placé avant toute route pour couvrir les assets, l'index de la SPA et /healthz.
  // En dessous du seuil par défaut (1 Ko), `compression` laisse passer tel quel — comprimer
  // coûterait plus que ça ne rapporte —, et un client qui n'annonce pas gzip reçoit l'original.
  app.use(compression());

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

  app.get("*", (request, response) => {
    if (request.path.startsWith("/assets/")) {
      response.status(404).end();
      return;
    }
    if (!existsSync(indexFile)) {
      response.status(404).type("text/plain").send("Front non construit");
      return;
    }
    response.set("Cache-Control", "no-cache").sendFile(indexFile);
  });

  return app;
}
