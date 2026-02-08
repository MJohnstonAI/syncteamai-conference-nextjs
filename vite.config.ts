import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { configDefaults } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "node_modules_backup/**"],
  },
}));
