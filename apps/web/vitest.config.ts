import { defineConfig } from "vitest/config";

// Ce fichier n'hérite PAS de vite.config.ts — Vitest le remplace entièrement, il ne le
// fusionne pas. La séparation existe parce que `vitest@2.1.9` dépend en interne de `vite@5`
// alors que l'app utilise `vite@6` : un seul fichier de config combinant les deux types de
// `defineConfig` produit un conflit de type sur `plugins` (`Plugin<any>` de vite@6 n'est pas
// assignable à celui de vite@5). Conséquence directe : tout `resolve.alias`, `define`
// (ex. `import.meta.env`) ou plugin (Tailwind, etc.) nécessaire aux tests doit être ajouté
// ICI en plus de vite.config.ts — sinon il fonctionnera sous `vite dev`/`vite build` et
// échouera silencieusement sous `vitest run`.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
