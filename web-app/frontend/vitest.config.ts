import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./__tests__/setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
