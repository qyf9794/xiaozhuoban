import { useEffect, useRef, useState } from "react";
import type { Board } from "@xiaozhuoban/domain";
import { useContainedScrollableArea } from "../lib/useContainedScrollableArea";

function BoardRow({
  board,
  active,
  onSelect,
  onRename,
  onDelete
}: {
  board: Board;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(board.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useContainedScrollableArea(menuPanelRef, menuOpen);

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
    <div
      className={`sidebar-board-row ${active ? "is-active" : ""}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 8,
        position: "relative"
      }}
    >
      {editing ? (
        <input
          className="sidebar-board-input"
          autoFocus
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => {
            const next = draftName.trim();
            if (next) onRename(next);
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const next = draftName.trim();
              if (next) onRename(next);
              setEditing(false);
            }
            if (event.key === "Escape") {
              setDraftName(board.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          className="sidebar-board-button"
          onClick={onSelect}
          onDoubleClick={() => {
            setDraftName(board.name);
            setEditing(true);
          }}
          title="双击重命名"
        >
          {board.name}
        </button>
      )}

      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          className="sidebar-more-button"
          aria-label="更多操作"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <i className="sidebar-more-dot" />
            <i className="sidebar-more-dot" />
            <i className="sidebar-more-dot" />
          </span>
        </button>
        {menuOpen ? (
          <div
            ref={menuPanelRef}
            className="glass-dropdown-panel"
            style={{
              position: "absolute",
              right: 0,
              top: 24,
              minWidth: 88,
              padding: 4,
              zIndex: 99992,
              whiteSpace: "nowrap"
            }}
          >
            <button
              className="glass-dropdown-item glass-dropdown-item-danger"
              onClick={() => {
                setMenuOpen(false);
                const ok = window.confirm(`确认删除桌板「${board.name}」吗？\n该桌板内所有工具、布局和内容将被永久删除。`);
                if (ok) {
                  onDelete();
                }
              }}
            >
              删除
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BoardSidebar({
  boards,
  activeBoardId,
  onSelectBoard,
  onAddBoard,
  onRenameBoard,
  onDeleteBoard
}: {
  boards: Board[];
  activeBoardId?: string;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => void;
  onRenameBoard: (boardId: string, name: string) => void;
  onDeleteBoard: (boardId: string) => void;
}) {
  return (
    <aside
      className="sidebar-panel liquid-glass"
      style={{
        width: 280,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        position: "relative"
      }}
    >
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <strong className="sidebar-title">桌板</strong>
          <button type="button" className="sidebar-new-button" onClick={onAddBoard}>
            <span style={{ fontSize: 14, lineHeight: 1.1 }}>+ 新建</span>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {boards.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              active={board.id === activeBoardId}
              onSelect={() => onSelectBoard(board.id)}
              onRename={(name) => onRenameBoard(board.id, name)}
              onDelete={() => onDeleteBoard(board.id)}
            />
          ))}
        </div>
      </section>

    </aside>
  );
}
