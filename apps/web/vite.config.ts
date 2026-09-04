import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { UserConfig as VitestUserConfig } from "vitest/config";

declare module "vite" {
  interface UserConfig {
    test?: VitestUserConfig["test"];
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/socket.io": { target: "http://localhost:3000", ws: true } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
