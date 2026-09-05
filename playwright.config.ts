import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm build && pnpm -F @pkfind/server start",
    url: "http://localhost:3000/healthz",
    env: { PORT: "3000", COUNTDOWN_MS: "500", ROUND_REVEAL_MS: "1000", NODE_ENV: "production" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
