import {
  createPassthroughSchema,
  type AssistantAction,
  type AssistantToolResult
} from "@xiaozhuoban/assistant-core";

type SidebarSetArgs = { open?: boolean; mode?: "show" | "hide" | "toggle" };
type FullscreenSetArgs = { enabled?: boolean; mode?: "enter" | "exit" | "toggle" };
type CommandPaletteOpenArgs = { query?: string };
type AiDialogOpenArgs = { prompt?: string };
type EmptyArgs = Record<string, never>;

export interface AppShellActionBridge {
  setSidebarOpen?: (open: boolean) => Promise<void> | void;
  getSidebarOpen?: () => boolean;
  setFullscreen?: (enabled: boolean) => Promise<void> | void;
  getFullscreen?: () => boolean;
  openSettings?: () => Promise<void> | void;
  openCommandPalette?: (query?: string) => Promise<void> | void;
  openAiDialog?: (prompt?: string) => Promise<void> | void;
  openWallpaperPicker?: () => Promise<void> | void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

const sidebarSetSchema = createPassthroughSchema<SidebarSetArgs>(
  (value): value is SidebarSetArgs =>
    isRecord(value) &&
    (value.open === undefined || typeof value.open === "boolean") &&
    (value.mode === undefined || value.mode === "show" || value.mode === "hide" || value.mode === "toggle")
);

const fullscreenSetSchema = createPassthroughSchema<FullscreenSetArgs>(
  (value): value is FullscreenSetArgs =>
    isRecord(value) &&
    (value.enabled === undefined || typeof value.enabled === "boolean") &&
    (value.mode === undefined || value.mode === "enter" || value.mode === "exit" || value.mode === "toggle")
);

const emptySchema = createPassthroughSchema<EmptyArgs>((value): value is EmptyArgs => isRecord(value));
const commandPaletteOpenSchema = createPassthroughSchema<CommandPaletteOpenArgs>(
  (value): value is CommandPaletteOpenArgs => isRecord(value) && (value.query === undefined || typeof value.query === "string")
);
const aiDialogOpenSchema = createPassthroughSchema<AiDialogOpenArgs>(
  (value): value is AiDialogOpenArgs => isRecord(value) && (value.prompt === undefined || typeof value.prompt === "string")
);

function success(message: string, data?: unknown): AssistantToolResult {
  return { status: "success", message, data };
}

function failed(message: string, errorCode: string): AssistantToolResult {
  return { status: "failed", message, errorCode };
}

function defineAction<TArgs>(action: AssistantAction<TArgs>): AssistantAction<TArgs> {
  return action;
}

function resolveSidebarOpen(args: SidebarSetArgs, bridge: AppShellActionBridge) {
  if (typeof args.open === "boolean") return args.open;
  if (args.mode === "show") return true;
  if (args.mode === "hide") return false;
  return !bridge.getSidebarOpen?.();
}

function resolveFullscreenEnabled(args: FullscreenSetArgs, bridge: AppShellActionBridge) {
  if (typeof args.enabled === "boolean") return args.enabled;
  if (args.mode === "enter") return true;
  if (args.mode === "exit") return false;
  return !bridge.getFullscreen?.();
}

export function createAppShellActions(bridge: AppShellActionBridge): Array<AssistantAction<any>> {
  return [
    defineAction<SidebarSetArgs>({
      spec: {
        name: "app.sidebar.set",
        description: "Show, hide, or toggle the Xiaozhuoban sidebar.",
        parameters: sidebarSetSchema,
        risk: "safe",
        scope: "desktop",
        idempotency: "idempotent",
        concurrencyKey: "app.shell",
        examples: ["隐藏侧栏", "显示侧边栏", "把左侧栏收起来"]
      },
      async execute(args) {
        if (!bridge.setSidebarOpen) return failed("当前环境还不能控制侧栏", "APP_SIDEBAR_UNAVAILABLE");
        const open = resolveSidebarOpen(args, bridge);
        await bridge.setSidebarOpen(open);
        return success(open ? "已显示侧栏" : "已隐藏侧栏", { open });
      }
    }),
    defineAction<FullscreenSetArgs>({
      spec: {
        name: "app.fullscreen.set",
        description: "Enter, exit, or toggle Xiaozhuoban page fullscreen.",
        parameters: fullscreenSetSchema,
        risk: "safe",
        scope: "desktop",
        idempotency: "idempotent",
        concurrencyKey: "app.shell",
        examples: ["全屏", "退出全屏", "进入小桌板全屏"]
      },
      async execute(args) {
        if (!bridge.setFullscreen) return failed("当前环境还不能控制全屏", "APP_FULLSCREEN_UNAVAILABLE");
        const enabled = resolveFullscreenEnabled(args, bridge);
        await bridge.setFullscreen(enabled);
        return success(enabled ? "已进入全屏" : "已退出全屏", { enabled });
      }
    }),
    defineAction<EmptyArgs>({
      spec: {
        name: "app.settings.open",
        description: "Open the Xiaozhuoban settings menu.",
        parameters: emptySchema,
        risk: "safe",
        scope: "desktop",
        idempotency: "idempotent",
        concurrencyKey: "app.shell",
        examples: ["打开设置", "显示设置菜单"]
      },
      async execute() {
        if (!bridge.openSettings) return failed("当前环境还不能打开设置", "APP_SETTINGS_UNAVAILABLE");
        await bridge.openSettings();
        return success("已打开设置");
      }
    }),
    defineAction<CommandPaletteOpenArgs>({
      spec: {
        name: "app.command_palette.open",
        description: "Open the Xiaozhuoban command/search palette.",
        parameters: commandPaletteOpenSchema,
        risk: "safe",
        scope: "desktop",
        idempotency: "idempotent",
        concurrencyKey: "app.shell",
        examples: ["打开搜索", "打开命令面板"]
      },
      async execute(args) {
        if (!bridge.openCommandPalette) return failed("当前环境还不能打开搜索", "APP_COMMAND_PALETTE_UNAVAILABLE");
        const query = args.query?.trim() || undefined;
        await bridge.openCommandPalette(query);
        return success("已打开搜索", query ? { query } : undefined);
      }
    }),
    defineAction<AiDialogOpenArgs>({
      spec: {
        name: "app.ai_dialog.open",
        description: "Open the AI widget creation dialog.",
        parameters: aiDialogOpenSchema,
        risk: "safe",
        scope: "desktop",
        idempotency: "idempotent",
        concurrencyKey: "app.shell",
        examples: ["打开 AI 生成", "新建 AI 小工具"]
      },
      async execute(args) {
        if (!bridge.openAiDialog) return failed("当前环境还不能打开 AI 生成", "APP_AI_DIALOG_UNAVAILABLE");
        const prompt = args.prompt?.trim() || undefined;
        await bridge.openAiDialog(prompt);
        return success("已打开 AI 生成", prompt ? { prompt } : undefined);
      }
    }),
    defineAction<EmptyArgs>({
      spec: {
        name: "app.wallpaper.pick",
        description: "Open the Xiaozhuoban wallpaper or desktop background picker.",
        parameters: emptySchema,
        risk: "safe",
        scope: "desktop",
        idempotency: "stateful",
        concurrencyKey: "app.shell",
        examples: ["更换壁纸", "换桌面背景", "选择壁纸"]
      },
      async execute() {
        if (!bridge.openWallpaperPicker) return failed("当前环境还不能更换壁纸", "APP_WALLPAPER_UNAVAILABLE");
        await bridge.openWallpaperPicker();
        return success("已打开壁纸选择器");
      }
    })
  ];
}
