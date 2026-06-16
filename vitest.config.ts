import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // mirror tsconfig "@/*" -> repo root
    alias: { "@": process.cwd() },
  },
});
