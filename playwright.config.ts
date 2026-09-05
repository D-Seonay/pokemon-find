import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm build && pnpm -F @pkfind/server start",
    url: "http://localhost:3000/healthz",
    env: { PORT: "3000", COUNTDOWN_MS: "500", ROUND_REVEAL_MS: "1000", NODE_ENV: "production" },
    // Toujours false : /healthz ne renvoie que statut et compteurs, pas la config du serveur, donc
    // Playwright ne peut pas distinguer un serveur déjà lancé avec les bons réglages d'un serveur
    // parasite (ex. un `pnpm dev` oublié) qui répondrait sur le même port avec les valeurs par
    // défaut. Un port 3000 déjà occupé doit faire échouer le lancement bruyamment, pas être réutilisé.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
