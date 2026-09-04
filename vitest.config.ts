import { coverageConfigDefaults, defineConfig } from "vitest/config";

// `vitest.workspace.ts` only lists the project globs (it exports a bare array, not a config
// object), so it cannot carry a `test` key. Coverage settings that must apply to every project
// in the workspace — like this exclusion list — belong in this sibling root config instead.
export default defineConfig({
  test: {
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        "**/coverage/**",
        "scripts/**",
        "**/src/index.ts",
      ],
    },
  },
});
