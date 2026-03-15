import path from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function getPackageName(id: string): string | null {
  const match = id.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
  return match?.[1] ?? null;
}

function resolveGitCommonRepoRoot() {
  try {
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();
    if (!gitCommonDir) {
      return null;
    }
    return path.resolve(__dirname, gitCommonDir, "..");
  } catch {
    return null;
  }
}

const gitCommonRepoRoot = resolveGitCommonRepoRoot();
const allowedFsRoots = [path.resolve(__dirname, "../..")];
if (gitCommonRepoRoot && !allowedFsRoots.includes(gitCommonRepoRoot)) {
  allowedFsRoots.push(gitCommonRepoRoot);
}

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: allowedFsRoots
    }
  },
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
