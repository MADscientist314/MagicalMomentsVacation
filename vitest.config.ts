import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: the Cloudflare plugin starts its own dev server,
// which can't run inside Vitest. Unit tests run in plain Node.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
