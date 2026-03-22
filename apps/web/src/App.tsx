import { useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas } from "./components/BoardCanvas";
import { BoardSidebar } from "./components/BoardSidebar";
import { Toolbar } from "./components/Toolbar";
import { AIGeneratorDialog } from "./components/AIGeneratorDialog";
import { CommandPalette } from "./components/CommandPalette";
import { OnlineUsersDock } from "./components/OnlineUsersDock";
import { useAppStore } from "./store";
import { useAuthStore } from "./auth/authStore";
import { supabase } from "./lib/supabase";
import { resolveUserName } from "./lib/collab";
import { showDesktopWindowWhenReady } from "./lib/desktopWindow";
import { abandonUserMonopolyMatches } from "./lib/monopolyOnline";
import { SupabaseRepository } from "@xiaozhuoban/data";

const MOBILE_FRAME_WIDTH = 390;
const MOBILE_VIEWPORT_MAX = 900;
const WALLPAPER_MIN_LONG_EDGE = 1600;
const WALLPAPER_MAX_LONG_EDGE = 2560;
const repositoryByUserId = new Map<string, SupabaseRepository>();

function isLikelyMobileUA() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile|windows phone/i.test(navigator.userAgent);
}

async function normalizeWallpaperFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("壁纸加载失败"));
      nextImage.src = objectUrl;
    });

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("无法识别壁纸尺寸");
    }

    const dpr = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const viewportLongEdge =
      typeof window === "undefined"
        ? WALLPAPER_MIN_LONG_EDGE
        : Math.max(window.innerWidth, window.innerHeight) * dpr;
    const targetLongEdge = Math.max(
      WALLPAPER_MIN_LONG_EDGE,
      Math.min(WALLPAPER_MAX_LONG_EDGE, Math.ceil(viewportLongEdge))
    );
    const sourceLongEdge = Math.max(sourceWidth, sourceHeight);
    const scale = sourceLongEdge > targetLongEdge ? targetLongEdge / sourceLongEdge : 1;
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    if (scale === 1) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("壁纸读取失败"));
          }
        };
        reader.onerror = () => reject(new Error("壁纸读取失败"));
        reader.readAsDataURL(file);
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("壁纸处理失败");
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getRepositoryForUser(userId: string): SupabaseRepository {
  const cached = repositoryByUserId.get(userId);
  if (cached) {
    return cached;
  }
  const repository = new SupabaseRepository(supabase, userId);
  repositoryByUserId.set(userId, repository);
  return repository;
}

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
  const userId = user?.id;
  const currentDisplayName = resolveUserName({
    email: user?.email ?? null,
    userMetadata: (user?.user_metadata as Record<string, unknown> | undefined) ?? null
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? MOBILE_FRAME_WIDTH : window.innerWidth
  );
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
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const isMobileUa = useMemo(() => isLikelyMobileUA(), []);
  const isMobileMode = isMobileUa || viewportWidth <= MOBILE_VIEWPORT_MAX;

  const activeBoard = useMemo(() => boards.find((item) => item.id === activeBoardId), [activeBoardId, boards]);
  const appBackgroundColor = activeBoard?.background.type === "color" ? activeBoard.background.value : "#0f172a";
  const appBackgroundImage = activeBoard?.background.type === "image" ? activeBoard.background.value : null;

  useEffect(() => {
    if (!userId) return;
    const repository = getRepositoryForUser(userId);
    setRepository(repository);
    void initialize();
  }, [initialize, setRepository, userId]);

  useEffect(() => {
    if (!ready || !activeBoard) return;
    void showDesktopWindowWhenReady();
  }, [activeBoard, ready]);


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

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (isMobileMode || !fullscreen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [fullscreen, isMobileMode]);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  useEffect(() => {
    if (!isMobileMode) {
      setMobileSidebarOpen(false);
    }
  }, [isMobileMode]);

  useEffect(() => {
    const previousBackground = document.body.style.background;
    const previousBackgroundColor = document.body.style.backgroundColor;
    const previousBackgroundAttachment = document.body.style.backgroundAttachment;
    const previousRootBackgroundColor = document.documentElement.style.backgroundColor;

    if (activeBoard) {
      document.body.style.background = "none";
      document.body.style.backgroundColor = appBackgroundColor;
      document.body.style.backgroundAttachment = "scroll";
      document.documentElement.style.backgroundColor = appBackgroundColor;
    }

    return () => {
      document.body.style.background = previousBackground;
      document.body.style.backgroundColor = previousBackgroundColor;
      document.body.style.backgroundAttachment = previousBackgroundAttachment;
      document.documentElement.style.backgroundColor = previousRootBackgroundColor;
    };
  }, [activeBoard, appBackgroundColor]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!isMobileMode) return;

    let lastTouchEnd = 0;
    const preventGesture = (event: Event) => event.preventDefault();
    const preventPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };
    const preventDoubleTapZoom = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd < 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    };
    const preventCtrlZoom = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("touchmove", preventPinch, { passive: false });
    document.addEventListener("touchend", preventDoubleTapZoom, { passive: false });
    window.addEventListener("wheel", preventCtrlZoom, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("touchmove", preventPinch);
      document.removeEventListener("touchend", preventDoubleTapZoom);
      window.removeEventListener("wheel", preventCtrlZoom);
    };
  }, [isMobileMode]);

  if (!ready || !activeBoard) {
    return <div className="loading">初始化中...</div>;
  }

  return (
    <div className={`app-shell ${isMobileMode ? "app-shell-mobile" : ""}`}>
      <div className="app-background-layer" style={{ backgroundColor: appBackgroundColor }}>
        {appBackgroundImage ? <img className="app-background-image" src={appBackgroundImage} alt="" /> : null}
      </div>
      <div className={isMobileMode ? "mobile-stage" : "desktop-stage"}>
        {sidebarOpen && !fullscreen && !isMobileMode ? (
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
              onAddWidget={(definitionId) => void addWidgetInstance(definitionId, { mobileMode: isMobileMode })}
              onOpenAiDialog={() => setAiDialogOpen(true)}
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
            onMove={(widgetId, x, y) => void updateWidgetPosition(widgetId, x, y)}
            onResize={(widgetId, w, h) => void updateWidgetSize(widgetId, w, h)}
            onStateChange={(widgetId, state) => void updateWidgetState(widgetId, state)}
            onRemoveWidget={(widgetId) => void handleRemoveWidget(widgetId)}
          />

          {!isMobileMode ? (
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
          ) : null}

        </main>

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

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        boards={boards}
        definitions={widgetDefinitions}
        widgets={widgetInstances}
        onAddWidget={(definitionId) => void addWidgetInstance(definitionId, { mobileMode: isMobileMode })}
      />

      <AIGeneratorDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        onGenerate={(prompt) => generateAiWidget(prompt, { mobileMode: isMobileMode })}
      />

      <OnlineUsersDock isMobileMode={isMobileMode} />

      <input
        ref={wallpaperInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void (async () => {
            try {
              const result = await normalizeWallpaperFile(file);
              await setBoardWallpaper(result);
            } catch (error) {
              const message = error instanceof Error ? error.message : "壁纸导入失败";
              window.alert(message);
            }
          })();
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
