import { createServer } from "node:http";
import { Server } from "socket.io";
import { ConfigError, loadConfig, type Config } from "./config.js";
import { createHttpApp } from "./http.js";
import { log, setLogLevel } from "./log.js";
import { RoomStore } from "./rooms/RoomStore.js";
import { registerHandlers } from "./socket/handlers.js";
import type { AppServer } from "./socket/types.js";

function loadConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`Configuration invalide : ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();
setLogLevel(config.logLevel);

const httpServer = createServer();
const io: AppServer = new Server(httpServer, {
  maxHttpBufferSize: 4096,
  ...(config.corsOrigin ? { cors: { origin: config.corsOrigin } } : {}),
});

const store = new RoomStore(config, io);
store.startPurge();
registerHandlers(io, store, config);

httpServer.on(
  "request",
  createHttpApp(config, () => store.stats()),
);
httpServer.listen(config.port, () => log.info("server_started", { port: config.port }));

// Filet de sécurité : `safe()` dans handlers.ts intercepte déjà tout ce qui peut planter
// dans le cycle de vie normal d'un événement Socket.IO, mais une erreur imprévue ailleurs
// (une dépendance, une promesse oubliée) ne doit toujours pas faire tomber le process et
// couper toutes les rooms en cours. On journalise et on continue de servir.
process.on("uncaughtException", (error) => {
  log.error("uncaught_exception", { message: String(error) });
});

process.on("unhandledRejection", (reason) => {
  log.error("unhandled_rejection", { message: String(reason) });
});

process.on("SIGTERM", () => {
  log.info("shutdown_requested");
  store.destroyAll("shutdown");
  store.stopPurge();
  void io.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
});
