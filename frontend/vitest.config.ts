import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Only pick TSX suites by glob; add the two TS utility tests explicitly.
    include: ["tests/**/*.test.tsx", "tests/ratelimits.test.ts", "tests/ws.test.ts"],
  },
  esbuild: {
    jsx: "automatic",
  },
});