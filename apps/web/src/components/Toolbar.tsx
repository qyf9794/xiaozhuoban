import { useEffect, useMemo, useRef, useState } from "react";
import type { Board, WidgetDefinition } from "@xiaozhuoban/domain";

function SidebarToggleIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2.25" width="12" height="11.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      {open ? <rect x="2.75" y="3" width="3.25" height="10" rx="1" fill="currentColor" opacity="0.88" /> : null}
      {!open ? <rect x="10" y="3" width="3.25" height="10" rx="1" fill="currentColor" opacity="0.88" /> : null}
      <path d="M8 3v10" stroke="currentColor" strokeWidth="1" opacity="0.42" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.75 6V2.75H6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 2.75h3.25V6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.25 10v3.25H10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 13.25H2.75V10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Toolbar({
  board,
  definitions,
  sidebarOpen,
  isMobileMode = false,
  fullscreen,
  onToggleFullscreen,
  onToggleSidebar,
  onOpenMobileMenu,
  onOpenCommandPalette,
  onPickWallpaper,
  onSignOut,
  onBackup,
  onImportBackup,
  onAddWidget,
  onOpenAiDialog,
  onEditDisplayName
}: {
  board: Board;
  definitions: WidgetDefinition[];
  sidebarOpen: boolean;
  isMobileMode?: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
  onOpenMobileMenu?: () => void;
  onOpenCommandPalette: () => void;
  onPickWallpaper: () => void;
  onSignOut: () => void;
  onBackup: () => void;
  onImportBackup: () => void;
  onAddWidget: (definitionId: string) => void;
  onOpenAiDialog: () => void;
  onEditDisplayName: () => void;
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

  const uniqueDefinitions = useMemo(() => {
    const seen = new Set<string>();
    return definitions.filter((definition) => {
      const key = definition.name.trim().toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [definitions]);

  return (
    <header
      className={isMobileMode ? "toolbar-mobile" : undefined}
      style={{
        position: isMobileMode ? "sticky" : "relative",
        top: isMobileMode ? 0 : undefined,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        background: "linear-gradient(170deg, rgba(255,255,255,0.5), rgba(255,255,255,0.28))",
        borderBottom: "1px solid rgba(255,255,255,0.6)",
        backdropFilter: "blur(18px) saturate(130%)",
        paddingTop: isMobileMode ? "calc(env(safe-area-inset-top) + 8px)" : "10px"
      }}
    >
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button
          aria-label={isMobileMode ? "打开桌板菜单" : sidebarOpen ? "隐藏侧栏" : "显示侧栏"}
          onClick={isMobileMode ? onOpenMobileMenu : onToggleSidebar}
          style={{
            border: "none",
            background: "transparent",
            color: "#94a3b8",
            fontSize: isMobileMode ? 20 : 18,
            lineHeight: 1,
            cursor: "pointer",
            padding: 0,
            width: 28,
            height: 28,
            display: "grid",
            placeItems: "center"
          }}
        >
          {isMobileMode ? "☰" : <SidebarToggleIcon open={sidebarOpen} />}
        </button>
        {!isMobileMode ? (
          <button
            aria-label={fullscreen ? "退出全屏" : "全屏"}
            onClick={onToggleFullscreen}
            style={{
              border: "none",
              background: "transparent",
              color: "#94a3b8",
              cursor: "pointer",
              padding: 0,
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center"
            }}
          >
            <FullscreenIcon />
          </button>
        ) : null}
        <h1
          style={{
            margin: 0,
            fontSize: isMobileMode ? 16 : 18,
            maxWidth: isMobileMode ? 150 : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {board.name}
        </h1>
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
              minWidth: isMobileMode ? 102 : 118,
              background: "linear-gradient(170deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72))",
              boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
              backdropFilter: "blur(16px) saturate(130%)",
              color: "#0f172a",
              fontSize: isMobileMode ? 13 : 14,
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
                fontSize: 14,
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
              {uniqueDefinitions.map((definition) => (
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
              {!isMobileMode ? (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleSidebar();
                  }}
                  className="glass-dropdown-item"
                >
                  {sidebarOpen ? "隐藏侧栏" : "显示侧栏"}
                </button>
              ) : null}
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
                  onEditDisplayName();
                }}
                className="glass-dropdown-item"
              >
                修改用户名
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
