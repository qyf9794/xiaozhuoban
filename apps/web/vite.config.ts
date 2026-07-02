import path from "node:path";
import { execSync } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
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

function applyLocalRealtimeApiEnv(env: Record<string, string>): void {
  const keys = [
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "XIAOZHUOBAN_TEXT_TOOL_MODEL",
    "XIAOZHUOBAN_E2E_REALTIME_AUTH_BYPASS"
  ];

  for (const key of keys) {
    if (!process.env[key] && env[key]) {
      process.env[key] = env[key];
    }
  }
}

function localRealtimeApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: "xiaozhuoban-local-realtime-api",
    configureServer(server) {
      applyLocalRealtimeApiEnv(env);

      server.middlewares.use("/api/realtime/session", async (request, response) => {
        const { default: handler } = await server.ssrLoadModule("./api/realtime/session.ts");
        await handler(request as IncomingMessage, response as ServerResponse);
      });
      server.middlewares.use("/api/realtime/tool-call", async (request, response) => {
        const { default: handler } = await server.ssrLoadModule("./api/realtime/tool-call.ts");
        await handler(request as IncomingMessage, response as ServerResponse);
      });
      server.middlewares.use("/api/assistant/diagnostics", async (request, response) => {
        const { default: handler } = await server.ssrLoadModule("./api/assistant/diagnostics.ts");
        await handler(request as IncomingMessage, response as ServerResponse);
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");

  return {
    plugins: [react(), localRealtimeApiPlugin(env)],
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
  };
});
