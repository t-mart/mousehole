import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Auto-restore vi.spyOn mocks after each test, so suites don't hand-roll
    // mockRestore() in afterEach.
    restoreMocks: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Hush console output from passing tests; a failing test still prints its
    // logs in full, so a red run keeps everything you need to debug it.
    silent: "passed-only",
  },
});
