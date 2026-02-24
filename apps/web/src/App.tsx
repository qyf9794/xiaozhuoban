import { useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas } from "./components/BoardCanvas";
import { BoardSidebar } from "./components/BoardSidebar";
import { Toolbar } from "./components/Toolbar";
import { AIGeneratorDialog } from "./components/AIGeneratorDialog";
import { CommandPalette } from "./components/CommandPalette";
import { useAppStore } from "./store";

export function App() {
  const {
    ready,
    initialize,
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
    toggleLayoutMode,
    updateWidgetPosition,
    updateWidgetState,
    setCommandPaletteOpen,
    setAiDialogOpen,
    generateAiWidget,
    createBackupSnapshot
  } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);

  const activeBoard = useMemo(() => boards.find((item) => item.id === activeBoardId), [activeBoardId, boards]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

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
            onToggleLayoutMode={() => void toggleLayoutMode()}
            onPickWallpaper={() => wallpaperInputRef.current?.click()}
            onBackup={() => {
              void (async () => {
                const snapshot = await createBackupSnapshot();
                const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `xiaozhuoban-backup-${new Date().toISOString().slice(0, 19)}.json`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                URL.revokeObjectURL(url);
              })();
            }}
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
      </main>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        boards={boards}
        definitions={widgetDefinitions}
        widgets={widgetInstances}
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
    </div>
  );
}
