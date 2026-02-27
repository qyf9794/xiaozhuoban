import { useEffect, useRef, useState } from "react";
import type { Board, WidgetDefinition } from "@xiaozhuoban/domain";

export function Toolbar({
  board,
  definitions,
  sidebarOpen,
  fullscreen,
  onToggleFullscreen,
  onToggleSidebar,
  onOpenCommandPalette,
  onPickWallpaper,
  onSignOut,
  onBackup,
  onImportBackup,
  onAddWidget,
  onOpenAiDialog
}: {
  board: Board;
  definitions: WidgetDefinition[];
  sidebarOpen: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onPickWallpaper: () => void;
  onSignOut: () => void;
  onBackup: () => void;
  onImportBackup: () => void;
  onAddWidget: (definitionId: string) => void;
  onOpenAiDialog: () => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (addMenuRef.current && !addMenuRef.current.contains(target)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <header
      style={{
        position: "relative",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        background: "linear-gradient(170deg, rgba(255,255,255,0.5), rgba(255,255,255,0.28))",
        borderBottom: "1px solid rgba(255,255,255,0.6)",
        backdropFilter: "blur(18px) saturate(130%)"
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          aria-label={sidebarOpen ? "隐藏侧栏" : "显示侧栏"}
          onClick={onToggleSidebar}
          style={{
            border: "none",
            background: "transparent",
            color: "#94a3b8",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            padding: 2
          }}
        >
          {sidebarOpen ? "◧" : "◨"}
        </button>
        <button
          aria-label={fullscreen ? "退出全屏" : "全屏"}
          onClick={onToggleFullscreen}
          style={{
            border: "none",
            background: "transparent",
            color: "#94a3b8",
            fontSize: 17,
            lineHeight: 1,
            cursor: "pointer",
            padding: 2
          }}
        >
          {fullscreen ? "🗗" : "⛶"}
        </button>
        <h1 style={{ margin: 0, fontSize: 18 }}>{board.name}</h1>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div ref={addMenuRef} style={{ position: "relative" }}>
          <button
            aria-label="添加 Widget"
            onClick={() => setAddMenuOpen((prev) => !prev)}
            style={{
              border: "1px solid rgba(255,255,255,0.62)",
              borderRadius: 14,
              padding: "7px 30px 7px 10px",
              minWidth: 118,
              background: "linear-gradient(170deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72))",
              boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
              backdropFilter: "blur(16px) saturate(130%)",
              color: "#0f172a",
              fontSize: 12,
              lineHeight: 1.2,
              cursor: "pointer",
              position: "relative",
              textAlign: "left"
            }}
          >
            添加 Widget
            <span
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#64748b",
                fontSize: 12,
                lineHeight: 1
              }}
            >
              ▾
            </span>
          </button>
          {addMenuOpen ? (
            <div
              className="glass-dropdown-panel"
              style={{
                position: "absolute",
                right: 0,
                top: 34,
                width: 180,
                padding: 6,
                zIndex: 99992,
                maxHeight: 320,
                overflowY: "auto"
              }}
            >
              <button
                onClick={() => {
                  setAddMenuOpen(false);
                  onOpenAiDialog();
                }}
                className="glass-dropdown-item"
              >
                ✨ AI 生成
              </button>
              {definitions.map((definition) => (
                <button
                  key={definition.id}
                  onClick={() => {
                    setAddMenuOpen(false);
                    onAddWidget(definition.id);
                  }}
                  className="glass-dropdown-item"
                >
                  {definition.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            aria-label="设置"
            onClick={() => setMenuOpen((prev) => !prev)}
            style={{
              border: "none",
              background: "transparent",
              color: "#94a3b8",
              fontSize: 26,
              lineHeight: 1,
              cursor: "pointer",
              padding: 2
            }}
          >
            ⚙
          </button>
          {menuOpen ? (
            <div
              className="glass-dropdown-panel"
              style={{
                position: "absolute",
                right: 0,
                top: 28,
                width: 180,
                padding: 6,
                zIndex: 99992
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenCommandPalette();
                }}
                className="glass-dropdown-item"
              >
                搜索
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onToggleSidebar();
                }}
                className="glass-dropdown-item"
              >
                {sidebarOpen ? "隐藏侧栏" : "显示侧栏"}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onPickWallpaper();
                }}
                className="glass-dropdown-item"
              >
                壁纸
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onBackup();
                }}
                className="glass-dropdown-item"
              >
                备份
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onImportBackup();
                }}
                className="glass-dropdown-item"
              >
                导入
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut();
                }}
                className="glass-dropdown-item"
              >
                退出登录
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
