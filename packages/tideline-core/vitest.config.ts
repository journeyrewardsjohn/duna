import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      reporter: ["text"],
      thresholds: {
        "src/score.ts": { branches: 100 },
        "src/light.ts": { branches: 100 },
        "src/time-slots.ts": { branches: 100 },
      },
    },
  },
});
