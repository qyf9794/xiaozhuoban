import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Board, WidgetDefinition } from "@xiaozhuoban/domain";

export function Toolbar({
  board,
  definitions,
  sidebarOpen,
  fullscreen,
  onToggleFullscreen,
  onToggleSidebar,
  onOpenCommandPalette,
  onToggleLayoutMode,
  onPickWallpaper,
  onBackup,
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
  onToggleLayoutMode: () => void;
  onPickWallpaper: () => void;
  onBackup: () => void;
  onAddWidget: (definitionId: string) => void;
  onOpenAiDialog: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
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
        <select
          onChange={(event) => {
            if (event.target.value) {
              if (event.target.value === "__ai__") {
                onOpenAiDialog();
              } else {
                onAddWidget(event.target.value);
              }
              event.target.value = "";
            }
          }}
          defaultValue=""
          style={{
            border: "1px solid rgba(255,255,255,0.58)",
            borderRadius: 12,
            padding: "6px 8px",
            background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.36))"
          }}
        >
          <option value="" disabled>
            添加 Widget
          </option>
          <option value="__ai__">✨ AI 生成</option>
          {definitions.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.name}
            </option>
          ))}
        </select>
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
              style={{
                position: "absolute",
                right: 0,
                top: 28,
                width: 180,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.62)",
                background: "linear-gradient(170deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72))",
                boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
                backdropFilter: "blur(16px)",
                padding: 6,
                zIndex: 1300
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenCommandPalette();
                }}
                style={menuItemStyle}
              >
                搜索
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onToggleSidebar();
                }}
                style={menuItemStyle}
              >
                {sidebarOpen ? "隐藏侧栏" : "显示侧栏"}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onToggleLayoutMode();
                }}
                style={menuItemStyle}
              >
                {board.layoutMode === "grid" ? "切到自由布局" : "切到网格布局"}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onPickWallpaper();
                }}
                style={menuItemStyle}
              >
                壁纸
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onBackup();
                }}
                style={menuItemStyle}
              >
                备份
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

const menuItemStyle: CSSProperties = {
  width: "100%",
  border: "none",
  background: "transparent",
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: 8,
  cursor: "pointer",
  color: "#0f172a"
};
