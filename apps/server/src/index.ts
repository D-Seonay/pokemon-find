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

process.on("SIGTERM", () => {
  log.info("shutdown_requested");
  store.destroyAll("shutdown");
  store.stopPurge();
  void io.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
});
