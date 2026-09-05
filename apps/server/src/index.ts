import { createServer } from "node:http";
import { ConfigError, loadConfig, type Config } from "./config.js";
import { createHttpApp } from "./http.js";
import { log, setLogLevel } from "./log.js";

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

// Le registre des rooms et le branchement Socket.IO arrivent aux tâches 16 à 18.
const app = createHttpApp(config, () => ({ rooms: 0, players: 0 }));
const server = createServer(app);

server.listen(config.port, () => log.info("server_started", { port: config.port }));

process.on("SIGTERM", () => {
  log.info("shutdown_requested");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
});
