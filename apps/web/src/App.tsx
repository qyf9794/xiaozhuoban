import { useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas } from "./components/BoardCanvas";
import { BoardSidebar } from "./components/BoardSidebar";
import { Toolbar } from "./components/Toolbar";
import { AIGeneratorDialog } from "./components/AIGeneratorDialog";
import { CommandPalette } from "./components/CommandPalette";
import { OnlineUsersDock } from "./components/OnlineUsersDock";
import { VoiceAssistantDock } from "./components/VoiceAssistantDock";
import { useAppStore } from "./store";
import { useAuthStore } from "./auth/authStore";
import { resolveUserName } from "./lib/collab";
import { abandonUserMonopolyMatches } from "./lib/monopolyOnline";
import { useAppBackground } from "./hooks/useAppBackground";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useAssistantRuntimeController } from "./hooks/useAssistantRuntimeController";
import { useBackupImportExport } from "./hooks/useBackupImportExport";
import { useResponsiveShell } from "./hooks/useResponsiveShell";
import { useWallpaperUpload } from "./hooks/useWallpaperUpload";
import { WORKBENCH_FEATURE_ENABLED } from "./workbench/config";
import { WorkbenchToggle, WorkbenchViewport } from "./workbench/WorkbenchShell";
import { readWorkbenchAssistantState, useWorkbenchStore } from "./workbench/store";

const E2E_AUTH_BYPASS = import.meta.env.VITE_XIAOZHUOBAN_E2E_AUTH_BYPASS === "true";

function createUiCommandTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `ui_ai_dialog_${crypto.randomUUID()}`;
  }
  return `ui_ai_dialog_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function App() {
  const {
    ready,
    repository,
    initialize,
    setRepository,
    boards,
    widgetDefinitions,
    widgetInstances,
    activeBoardId,
    focusedWidgetId,
    commandPaletteOpen,
    aiDialogOpen,
    addBoard,
    renameBoard,
    deleteBoard,
    setBoardWallpaper,
    setActiveBoard,
    addWidgetInstance,
    removeWidgetInstance,
    focusWidget,
    updateWidgetPosition,
    updateWidgetSize,
    updateWidgetState,
    autoAlignWidgets,
    setCommandPaletteOpen,
    setAiDialogOpen,
    generateAiWidget,
    createBackupSnapshot,
    importBackupSnapshot
  } = useAppStore();
  const { user, signOut, updateDisplayName } = useAuthStore();
  const userId = user?.id ?? (E2E_AUTH_BYPASS ? "e2e-local-user" : undefined);
  const currentDisplayName = E2E_AUTH_BYPASS && !user
    ? "E2E 测试用户"
    : resolveUserName({
        email: user?.email ?? null,
        userMetadata: (user?.user_metadata as Record<string, unknown> | undefined) ?? null
      });
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] = useState("");
  const [aiDialogInitialPrompt, setAiDialogInitialPrompt] = useState("");
  const [settingsOpenRequestId, setSettingsOpenRequestId] = useState(0);
  const workbenchOpen = useWorkbenchStore((state) => state.open);
  const setWorkbenchOpen = useWorkbenchStore((state) => state.setOpen);
  const hydrateWorkbench = useWorkbenchStore((state) => state.hydrate);
  const workbenchTasks = useWorkbenchStore((state) => state.tasks);
  const markWorkbenchTaskRead = useWorkbenchStore((state) => state.markTaskRead);
  const deliveredWorkbenchTaskIdsRef = useRef(new Set<string>());
  const activeBoard = useMemo(() => boards.find((item) => item.id === activeBoardId), [activeBoardId, boards]);
  const appBackgroundColor = activeBoard?.background.type === "color" ? activeBoard.background.value : "#0f172a";
  const appBackgroundImage = activeBoard?.background.type === "image" ? activeBoard.background.value : null;
  const hasMobileWidgets = widgetInstances.length > 0;
  const {
    desktopViewportBottomInset,
    fullscreen,
    isMobileMode,
    mobileChromeVisible,
    mobileSidebarOpen,
    setFullscreen,
    setMobileSidebarOpen,
    setMobileToolbarMenuOpen,
    setSidebarOpen,
    sidebarOpen
  } = useResponsiveShell({ hasMobileWidgets });
  const { handleWallpaperInputChange, openWallpaperPicker, wallpaperInputRef } = useWallpaperUpload({
    setBoardWallpaper
  });
  const { backupInputRef, exportBackup, handleBackupInputChange, openBackupImporter } = useBackupImportExport({
    activeBoardName: activeBoard?.name ?? "小桌板",
    createBackupSnapshot,
    importBackupSnapshot
  });
  const {
    assistantCapabilityBridge,
    assistantOperation,
    assistantRuntime,
    assistantSpeech,
    agentsVoiceAdapterEnabled,
    localWakeWordEnabled,
    localWakeWordAudioLevel,
    localWakeWordStatus,
    localWakeWordSupported,
    realtimeAudioLevel,
    realtimeHighAccuracyMode,
    realtimeStatus,
    recordDiagnostic,
    retrySync,
    runtimeStatusText,
    setAgentsVoiceAdapterEnabled,
    setLocalWakeWordEnabled,
    setRealtimeHighAccuracyMode,
    syncLastError,
    syncPendingCount,
    userSpeech
  } = useAssistantRuntimeController({
    fullscreen,
    onOpenAiDialog: (prompt) => {
      setAiDialogInitialPrompt(prompt ?? "");
      setAiDialogOpen(true);
    },
    onOpenCommandPalette: (query) => {
      setCommandPaletteInitialQuery(query ?? "");
      setCommandPaletteOpen(true);
    },
    onOpenSettings: () => setSettingsOpenRequestId((value) => value + 1),
    onOpenWallpaperPicker: openWallpaperPicker,
    getWorkbenchState: WORKBENCH_FEATURE_ENABLED ? readWorkbenchAssistantState : undefined,
    setWorkbenchOpen: WORKBENCH_FEATURE_ENABLED ? setWorkbenchOpen : undefined,
    setFullscreen,
    setSidebarOpen,
    sidebarOpen
  });

  useAppBootstrap({
    activeBoard,
    e2eAuthBypass: E2E_AUTH_BYPASS,
    hasAuthenticatedUser: Boolean(user),
    initialize,
    ready,
    setRepository,
    userId
  });
  useAppBackground({ activeBoard, backgroundColor: appBackgroundColor });

  useEffect(() => {
    if (!WORKBENCH_FEATURE_ENABLED || !userId) return;
    void hydrateWorkbench(userId, activeBoardId).catch(() => undefined);
  }, [activeBoardId, hydrateWorkbench, userId]);

  useEffect(() => {
    if (!WORKBENCH_FEATURE_ENABLED || realtimeStatus !== "connected") return;
    const completed = workbenchTasks.find(
      (task) =>
        task.unread &&
        (task.status === "succeeded" || task.status === "failed") &&
        !deliveredWorkbenchTaskIdsRef.current.has(task.id)
    );
    if (!completed) return;
    const message = completed.status === "succeeded"
      ? `[可信工作台后台事件] 任务已完成。请自然、简洁地向用户播报：${completed.reply || "任务已完成"}`
      : `[可信工作台后台事件] 任务失败。请向用户说明：${completed.error || "后台任务执行失败"}`;
    if (!assistantRuntime.appendTrustedRealtimeMessage(message)) return;
    deliveredWorkbenchTaskIdsRef.current.add(completed.id);
    void markWorkbenchTaskRead(completed.id).catch(() => {
      deliveredWorkbenchTaskIdsRef.current.delete(completed.id);
    });
  }, [assistantRuntime, markWorkbenchTaskRead, realtimeStatus, workbenchTasks]);

  const handleRemoveWidget = async (widgetId: string) => {
    const targetWidget = widgetInstances.find((item) => item.id === widgetId);
    const targetDefinition = widgetDefinitions.find((item) => item.id === targetWidget?.definitionId);
    if (targetDefinition?.type === "monopoly" && userId) {
      try {
        await abandonUserMonopolyMatches(userId);
      } catch {
        // Always allow the local widget to close; online cleanup is best-effort.
      }
    }
    await removeWidgetInstance(widgetId);
  };

  useEffect(() => {
    void assistantRuntime.harness.refreshRealtimeContext();
  }, [assistantRuntime, activeBoardId, boards, focusedWidgetId, widgetDefinitions, widgetInstances]);

  useEffect(() => {
    if (!E2E_AUTH_BYPASS) return undefined;
    const diagnosticsWindow = window as typeof window & {
      __xiaozhuobanExportAppState?: () => unknown;
    };
    diagnosticsWindow.__xiaozhuobanExportAppState = () => {
      const state = useAppStore.getState();
      const definitions = new Map(state.widgetDefinitions.map((definition) => [definition.id, definition]));
      return {
        ready: state.ready,
        activeBoardId: state.activeBoardId,
        focusedWidgetId: state.focusedWidgetId,
        persistedWidgets: state.widgetInstances.map((instance) => ({
          ...instance,
          definitionType: definitions.get(instance.definitionId)?.type ?? "",
          definitionName: definitions.get(instance.definitionId)?.name ?? ""
        }))
      };
    };
    return () => {
      delete diagnosticsWindow.__xiaozhuobanExportAppState;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }

      if (isMeta && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        const idx = Number(event.key) - 1;
        const board = boards[idx];
        if (board) {
          void setActiveBoard(board.id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActiveBoard, setCommandPaletteOpen, boards]);

  if (!ready || !activeBoard) {
    return <div className="loading">初始化中...</div>;
  }

  return (
    <div className={`app-shell ${isMobileMode ? "app-shell-mobile" : ""} ${WORKBENCH_FEATURE_ENABLED && workbenchOpen ? "workbench-stage-open" : ""}`}>
      <div className="app-background-layer" style={{ backgroundColor: appBackgroundColor }}>
        {appBackgroundImage ? <img className="app-background-image" src={appBackgroundImage} alt="" /> : null}
      </div>
      {WORKBENCH_FEATURE_ENABLED && isMobileMode && userId ? (
        <WorkbenchViewport
          open={workbenchOpen}
          userId={userId}
          boardId={activeBoardId}
          isMobileMode
          onClose={() => setWorkbenchOpen(false)}
        />
      ) : null}
      <div className={`${isMobileMode ? "mobile-stage" : "desktop-stage"} ${WORKBENCH_FEATURE_ENABLED && workbenchOpen ? "workbench-stage-open" : ""}`}>
        {sidebarOpen && !fullscreen && !isMobileMode && !workbenchOpen ? (
          <BoardSidebar
            boards={boards}
            activeBoardId={activeBoardId}
            onSelectBoard={(boardId) => void setActiveBoard(boardId)}
            onAddBoard={() => void addBoard()}
            onRenameBoard={(boardId, name) => void renameBoard(boardId, name)}
            onDeleteBoard={(boardId) => void deleteBoard(boardId)}
          />
        ) : null}
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: isMobileMode ? "100dvh" : "100vh",
            height: isMobileMode ? "100dvh" : "100vh",
            position: "relative"
          }}
        >
          {isMobileMode || !fullscreen ? (
            <Toolbar
              board={activeBoard}
              definitions={widgetDefinitions}
              sidebarOpen={sidebarOpen}
              isMobileMode={isMobileMode}
              mobileVisible={mobileChromeVisible}
              onMenuOpenChange={setMobileToolbarMenuOpen}
              settingsOpenRequestId={settingsOpenRequestId}
              realtimeHighAccuracyAvailable={!WORKBENCH_FEATURE_ENABLED}
              realtimeHighAccuracyMode={WORKBENCH_FEATURE_ENABLED ? false : realtimeHighAccuracyMode}
              onToggleRealtimeHighAccuracyMode={() => setRealtimeHighAccuracyMode((value) => !value)}
              localWakeWordEnabled={localWakeWordEnabled}
              onToggleLocalWakeWord={() => setLocalWakeWordEnabled((value) => !value)}
              agentsVoiceAdapterEnabled={agentsVoiceAdapterEnabled}
              onToggleAgentsVoiceAdapter={() => setAgentsVoiceAdapterEnabled((value) => !value)}
              fullscreen={fullscreen}
              onToggleFullscreen={() => {
                if (document.fullscreenElement) {
                  void document.exitFullscreen();
                } else {
                  void document.documentElement.requestFullscreen();
                }
              }}
              onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
              onOpenMobileMenu={() => setMobileSidebarOpen(true)}
              onOpenCommandPalette={() => {
                setCommandPaletteInitialQuery("");
                setCommandPaletteOpen(true);
              }}
              onPickWallpaper={openWallpaperPicker}
              onSignOut={() => {
                void signOut().catch((error) => {
                  const message = error instanceof Error ? error.message : "退出登录失败";
                  window.alert(message);
                });
              }}
              onBackup={exportBackup}
              onImportBackup={openBackupImporter}
              onAddWidget={(definitionId) => void addWidgetInstance(definitionId, { mobileMode: isMobileMode })}
              onOpenAiDialog={() => {
                recordDiagnostic({
                  type: "ai_dialog.open",
                  status: "success",
                  source: "user_click",
                  commandTraceId: createUiCommandTraceId(),
                  data: { trigger: "toolbar" }
                });
                setAiDialogInitialPrompt("");
                setAiDialogOpen(true);
              }}
              onEditDisplayName={() => {
                const next = window.prompt("请输入新的用户名", currentDisplayName)?.trim();
                if (!next || next === currentDisplayName) return;
                void updateDisplayName(next).catch((error) => {
                  const message = error instanceof Error ? error.message : "修改用户名失败";
                  window.alert(message);
                });
              }}
            />
          ) : null}

          <BoardCanvas
            board={activeBoard}
            definitions={widgetDefinitions}
            widgets={widgetInstances}
            fullscreen={fullscreen}
            isMobileMode={isMobileMode}
            presentationMode={WORKBENCH_FEATURE_ENABLED && workbenchOpen ? (isMobileMode ? "mobile-push" : "desktop-rail") : "closed"}
            focusedWidgetId={focusedWidgetId}
            assistantCapabilityBridge={assistantCapabilityBridge}
            onMove={(widgetId, x, y) => void updateWidgetPosition(widgetId, x, y)}
            onResize={(widgetId, w, h) => void updateWidgetSize(widgetId, w, h)}
            onStateChange={(widgetId, state) => void updateWidgetState(widgetId, state)}
            onFocusWidget={(widgetId) => void focusWidget(widgetId)}
            onRemoveWidget={(widgetId) => void handleRemoveWidget(widgetId)}
          />

          {!isMobileMode && !workbenchOpen ? (
            <button
              onClick={() => {
                const sidebarWidth = sidebarOpen && !fullscreen ? 280 : 0;
                const canvasWidth = Math.max(320, window.innerWidth - sidebarWidth - 24);
                void autoAlignWidgets(canvasWidth, { mobileMode: false });
              }}
              title="自动对齐"
              style={{
                position: "fixed",
                right: 14,
                bottom: desktopViewportBottomInset,
                width: 26,
                height: 26,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.58)",
                background: "linear-gradient(165deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34))",
                backdropFilter: "blur(12px)",
                color: "#64748b",
                fontSize: 14,
                lineHeight: 1,
                cursor: "pointer",
                zIndex: 1500,
                display: "grid",
                placeItems: "center"
              }}
            >
              ⊞
            </button>
          ) : null}

        </main>

        {WORKBENCH_FEATURE_ENABLED && !isMobileMode && userId ? (
          <WorkbenchViewport
            open={workbenchOpen}
            userId={userId}
            boardId={activeBoardId}
            isMobileMode={false}
            onClose={() => setWorkbenchOpen(false)}
          />
        ) : null}

        {isMobileMode && !fullscreen && mobileSidebarOpen ? (
          <>
            <button
              type="button"
              className="mobile-sidebar-backdrop"
              aria-label="关闭桌板菜单"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="mobile-sidebar-drawer" role="dialog" aria-modal="true" aria-label="桌板菜单">
              <BoardSidebar
                boards={boards}
                activeBoardId={activeBoardId}
                onSelectBoard={(boardId) => {
                  void setActiveBoard(boardId);
                  setMobileSidebarOpen(false);
                }}
                onAddBoard={() => void addBoard()}
                onRenameBoard={(boardId, name) => void renameBoard(boardId, name)}
                onDeleteBoard={(boardId) => void deleteBoard(boardId)}
              />
            </div>
          </>
        ) : null}
      </div>

      {WORKBENCH_FEATURE_ENABLED ? (
        <WorkbenchToggle open={workbenchOpen} isMobileMode={isMobileMode} onToggle={() => setWorkbenchOpen(!workbenchOpen)} />
      ) : null}

      <CommandPalette
        open={commandPaletteOpen}
        initialQuery={commandPaletteInitialQuery}
        onClose={() => setCommandPaletteOpen(false)}
        boards={boards}
        definitions={widgetDefinitions}
        widgets={widgetInstances}
        onAddWidget={(definitionId) => void addWidgetInstance(definitionId, { mobileMode: isMobileMode })}
      />

      <AIGeneratorDialog
        open={aiDialogOpen}
        initialPrompt={aiDialogInitialPrompt}
        onClose={() => setAiDialogOpen(false)}
        onGenerate={(prompt) => generateAiWidget(prompt, { mobileMode: isMobileMode })}
      />

      <OnlineUsersDock
        isMobileMode={isMobileMode}
        mobileVisible={mobileChromeVisible}
        desktopBottomInset={desktopViewportBottomInset}
      />

        <VoiceAssistantDock
          harness={assistantRuntime.harness}
          voiceStatus={realtimeStatus}
          voiceAudioLevel={realtimeAudioLevel}
          onConnectVoice={assistantRuntime.connect}
          onConnectTextOnly={assistantRuntime.connectTextOnly}
          onDisconnectVoice={assistantRuntime.disconnect}
          isMobileMode={isMobileMode}
          desktopBottomInset={desktopViewportBottomInset}
          operationStatus={assistantOperation}
          assistantSpeech={assistantSpeech}
          userSpeech={userSpeech}
          wakeWordEnabled={localWakeWordEnabled}
          wakeWordAudioLevel={localWakeWordAudioLevel}
          wakeWordStatus={localWakeWordStatus}
          wakeWordSupported={localWakeWordSupported}
          runtimeStatus={runtimeStatusText}
          syncPendingCount={syncPendingCount}
          syncLastError={syncLastError}
          onCommandRoute={assistantRuntime.recordCommandRoute}
          onSendRealtimeTextCommand={assistantRuntime.sendRealtimeTextCommand}
          onDiagnostic={recordDiagnostic}
          onRetrySync={async () => {
            await retrySync(repository);
          }}
        />

      <input
        ref={wallpaperInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleWallpaperInputChange}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleBackupInputChange}
      />
    </div>
  );
}
