import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@xiaozhuoban/domain": path.resolve(__dirname, "../../packages/domain/src"),
      "@xiaozhuoban/layout-engine": path.resolve(__dirname, "../../packages/layout-engine/src"),
      "@xiaozhuoban/widget-runtime": path.resolve(__dirname, "../../packages/widget-runtime/src"),
      "@xiaozhuoban/ai-builder": path.resolve(__dirname, "../../packages/ai-builder/src"),
      "@xiaozhuoban/data": path.resolve(__dirname, "../../packages/data/src"),
      "@xiaozhuoban/contracts": path.resolve(__dirname, "../../packages/contracts/src"),
      "@xiaozhuoban/ui": path.resolve(__dirname, "../../packages/ui/src")
    }
  }
});
