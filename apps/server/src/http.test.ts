import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, get as httpGet, type IncomingHttpHeaders, type Server } from "node:http";
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

/**
 * `fetch` (undici) négocie et décode la compression tout seul, ce qui masque justement
 * l'en-tête qu'on veut vérifier. On passe donc par une requête HTTP brute, en demandant
 * explicitement gzip, pour observer ce qui transite réellement sur le réseau.
 */
function rawGet(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: IncomingHttpHeaders; bytes: number }> {
  return new Promise((resolve, reject) => {
    const request = httpGet(url, { headers }, (response) => {
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
      });
      response.on("end", () =>
        resolve({ status: response.statusCode ?? 0, headers: response.headers, bytes }),
      );
    });
    request.on("error", reject);
  });
}

describe("HTTP compression", () => {
  let baseUrl = "";
  let server: Server;
  let webDir: string;

  // Au-delà du seuil par défaut de `compression` (1 Ko) et très redondant, donc
  // représentatif du bundle réel : du JavaScript compresse d'environ 4×.
  const asset = "const table = [" + "1,".repeat(20_000) + "];\n";
  const indexHtml =
    "<!doctype html><title>pkfind</title>" + "<p>chargement du Pokédex</p>".repeat(200);

  beforeAll(async () => {
    webDir = mkdtempSync(join(tmpdir(), "pkfind-http-test-gzip-"));
    mkdirSync(join(webDir, "assets"));
    writeFileSync(join(webDir, "assets", "big.js"), asset);
    // L'index doit lui aussi dépasser le seuil de 1 Ko, sinon `compression` le laisse
    // passer tel quel et le test ne prouverait rien sur la route SPA.
    writeFileSync(join(webDir, "index.html"), indexHtml);
    ({ baseUrl, server } = await startApp(webDir));
  });

  afterAll(async () => {
    await stopApp(server);
    rmSync(webDir, { recursive: true, force: true });
  });

  it("compresse un asset quand le client accepte gzip", async () => {
    const response = await rawGet(`${baseUrl}/assets/big.js`, { "accept-encoding": "gzip" });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    // La compression doit vraiment réduire la charge, pas seulement poser l'en-tête.
    expect(response.bytes).toBeLessThan(asset.length / 2);
  });

  it("sert l'asset tel quel à un client qui ne sait pas décompresser", async () => {
    const response = await rawGet(`${baseUrl}/assets/big.js`, { "accept-encoding": "identity" });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.bytes).toBe(asset.length);
  });

  it("compresse aussi l'index servi sur une route SPA", async () => {
    const response = await rawGet(`${baseUrl}/room/ABCD`, { "accept-encoding": "gzip" });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
  });
});
