import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function getPackageName(id: string): string | null {
  const match = id.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
  return match?.[1] ?? null;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const packageName = getPackageName(id);
          if (!packageName) return;

          const sanitized = packageName.replace(/[@/]/g, "-");
          return `vendor-${sanitized}`;
        }
      }
    }
  },
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
