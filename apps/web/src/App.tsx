import { useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas } from "./components/BoardCanvas";
import { BoardSidebar } from "./components/BoardSidebar";
import { Toolbar } from "./components/Toolbar";
import { AIGeneratorDialog } from "./components/AIGeneratorDialog";
import { CommandPalette } from "./components/CommandPalette";
import { useAppStore } from "./store";
import { useAuthStore } from "./auth/authStore";
import { supabase } from "./lib/supabase";
import { DexieRepository, SupabaseRepository } from "@xiaozhuoban/data";

export function App() {
  const {
    ready,
    initialize,
    setRepository,
    boards,
    widgetDefinitions,
    widgetInstances,
    activeBoardId,
    commandPaletteOpen,
    aiDialogOpen,
    addBoard,
    renameBoard,
    deleteBoard,
    setBoardWallpaper,
    setActiveBoard,
    addWidgetInstance,
    removeWidgetInstance,
    updateWidgetPosition,
    updateWidgetState,
    autoAlignWidgets,
    setCommandPaletteOpen,
    setAiDialogOpen,
    generateAiWidget,
    createBackupSnapshot,
    importBackupSnapshot
  } = useAppStore();
  const { user, signOut } = useAuthStore();
  const userId = user?.id;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const activeBoard = useMemo(() => boards.find((item) => item.id === activeBoardId), [activeBoardId, boards]);

  useEffect(() => {
    if (!userId) return;
    const repository = new SupabaseRepository(supabase, userId);
    setRepository(repository);
    void initialize();
  }, [initialize, setRepository, userId]);

  useEffect(() => {
    if (!ready || !userId) return;
    void new DexieRepository("xiaozhuoban").clearAll().catch(() => {
      // ignore local cleanup failures
    });
  }, [ready, userId]);

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

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  if (!ready || !activeBoard) {
    return <div className="loading">初始化中...</div>;
  }

  return (
    <div className="app-shell">
      {sidebarOpen && !fullscreen ? (
        <BoardSidebar
          boards={boards}
          activeBoardId={activeBoardId}
          onSelectBoard={(boardId) => void setActiveBoard(boardId)}
          onAddBoard={() => void addBoard()}
          onRenameBoard={(boardId, name) => void renameBoard(boardId, name)}
          onDeleteBoard={(boardId) => void deleteBoard(boardId)}
        />
      ) : null}
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {!fullscreen ? (
          <Toolbar
            board={activeBoard}
            definitions={widgetDefinitions}
            sidebarOpen={sidebarOpen}
            fullscreen={fullscreen}
            onToggleFullscreen={() => {
              if (document.fullscreenElement) {
                void document.exitFullscreen();
              } else {
                void document.documentElement.requestFullscreen();
              }
            }}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onPickWallpaper={() => wallpaperInputRef.current?.click()}
            onSignOut={() => {
              void signOut().catch((error) => {
                const message = error instanceof Error ? error.message : "退出登录失败";
                window.alert(message);
              });
            }}
            onBackup={() => {
              void (async () => {
                const snapshot = await createBackupSnapshot();
                const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
                const safeBoardName = (activeBoard.name || "小桌板")
                  .replace(/[\\/:*?"<>|]/g, "_")
                  .trim();
                anchor.download = `${safeBoardName}-备份-${timestamp}.json`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                URL.revokeObjectURL(url);
              })();
            }}
            onImportBackup={() => backupInputRef.current?.click()}
            onAddWidget={(definitionId) => void addWidgetInstance(definitionId)}
            onOpenAiDialog={() => setAiDialogOpen(true)}
          />
        ) : null}

        <BoardCanvas
          board={activeBoard}
          definitions={widgetDefinitions}
          widgets={widgetInstances}
          fullscreen={fullscreen}
          onMove={(widgetId, x, y) => void updateWidgetPosition(widgetId, x, y)}
          onStateChange={(widgetId, state) => void updateWidgetState(widgetId, state)}
          onRemoveWidget={(widgetId) => void removeWidgetInstance(widgetId)}
        />

        <button
          onClick={() => {
            const sidebarWidth = sidebarOpen && !fullscreen ? 280 : 0;
            const canvasWidth = Math.max(360, window.innerWidth - sidebarWidth - 24);
            void autoAlignWidgets(canvasWidth);
          }}
          title="自动对齐"
          style={{
            position: "fixed",
            right: 14,
            bottom: 14,
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
      </main>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        boards={boards}
        definitions={widgetDefinitions}
        widgets={widgetInstances}
        onAddWidget={(definitionId) => void addWidgetInstance(definitionId)}
      />

      <AIGeneratorDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        onGenerate={generateAiWidget}
      />

      <input
        ref={wallpaperInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result;
            if (typeof result === "string") {
              void setBoardWallpaper(result);
            }
          };
          reader.readAsDataURL(file);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void (async () => {
            try {
              const text = await file.text();
              const snapshot = JSON.parse(text) as unknown;
              const confirmed = window.confirm("导入会新建桌板并保留当前数据，是否继续？");
              if (!confirmed) return;
              const backupName = file.name.replace(/\.json$/i, "").trim();
              await importBackupSnapshot(snapshot, backupName);
              window.alert("导入成功");
            } catch (error) {
              const message = error instanceof Error ? error.message : "导入失败";
              window.alert(message);
            } finally {
              event.currentTarget.value = "";
            }
          })();
        }}
      />
    </div>
  );
}
