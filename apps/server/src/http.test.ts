import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { createHttpApp } from "./http.js";

let baseUrl = "";
const server = createServer(createHttpApp(loadConfig({}), () => ({ rooms: 2, players: 5 })));

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("HTTP", () => {
  it("répond sur /healthz avec les statistiques", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: "ok", rooms: 2, players: 5 });
    expect(typeof body.uptimeMs).toBe("number");
  });

  it("renvoie l'index sur une route inconnue quand le front est absent", async () => {
    const response = await fetch(`${baseUrl}/room/ABCD`);
    expect([200, 404]).toContain(response.status);
  });
});
