import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { createHttpApp } from "./http.js";

async function startApp(webDir: string): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(
    createHttpApp(loadConfig({ WEB_DIR: webDir }), () => ({ rooms: 2, players: 5 })),
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

async function stopApp(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe("HTTP /healthz", () => {
  let baseUrl = "";
  let server: Server;

  beforeAll(async () => {
    ({ baseUrl, server } = await startApp(join(tmpdir(), "pkfind-http-test-no-such-dir")));
  });

  afterAll(() => stopApp(server));

  it("répond sur /healthz avec les statistiques", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: "ok", rooms: 2, players: 5 });
    expect(typeof body.uptimeMs).toBe("number");
  });
});

describe("HTTP front absent", () => {
  let baseUrl = "";
  let server: Server;
  const webDir = join(tmpdir(), "pkfind-http-test-front-absent");

  beforeAll(async () => {
    rmSync(webDir, { recursive: true, force: true });
    ({ baseUrl, server } = await startApp(webDir));
  });

  afterAll(() => stopApp(server));

  it("renvoie 404 sur une route inconnue quand le front n'est pas construit", async () => {
    const response = await fetch(`${baseUrl}/room/ABCD`);
    expect(response.status).toBe(404);
  });
});

describe("HTTP front construit", () => {
  let baseUrl = "";
  let server: Server;
  let webDir: string;

  beforeAll(async () => {
    webDir = mkdtempSync(join(tmpdir(), "pkfind-http-test-front-"));
    writeFileSync(join(webDir, "index.html"), "<!doctype html><title>pkfind</title>");
    ({ baseUrl, server } = await startApp(webDir));
  });

  afterAll(async () => {
    await stopApp(server);
    rmSync(webDir, { recursive: true, force: true });
  });

  it("renvoie l'index sur une route SPA inconnue", async () => {
    const response = await fetch(`${baseUrl}/room/ABCD`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.text()).toContain("pkfind");
  });

  it("renvoie 404 sur un asset manquant plutôt que l'index", async () => {
    const response = await fetch(`${baseUrl}/assets/does-not-exist-xyz.js`);
    expect(response.status).toBe(404);
  });
});
