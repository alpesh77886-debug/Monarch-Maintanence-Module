import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    // Integration tests hit the real Supabase project sequentially (each
    // creates + fully exercises one [AUTOTEST] case) — running them in
    // parallel workers doesn't help here and would make failures harder to
    // read, so keep it simple and sequential.
    fileParallelism: false,
    // §21: one teardown per suite removes only the synthetic cases this run
    // created. No existing test needed changing, and no coverage was weakened
    // to make cleanup easier. See tests/global-teardown.ts.
    globalSetup: ["./tests/global-teardown.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
