import { useEffect, useRef, useState } from "react";
import { Button } from "@xiaozhuoban/ui";
import type { Board } from "@xiaozhuoban/domain";

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
      style={{
        border: "1px solid rgba(255,255,255,0.58)",
        borderRadius: 12,
        padding: "8px 10px",
        background: active
          ? "linear-gradient(160deg, rgba(45, 212, 191, 0.42), rgba(125, 211, 252, 0.52))"
          : "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.36))",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 8,
        position: "relative"
      }}
    >
      {editing ? (
        <input
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
          style={{
            width: "100%",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.62)",
            padding: "4px 6px",
            background: "rgba(255,255,255,0.78)"
          }}
        />
      ) : (
        <button
          onClick={onSelect}
          onDoubleClick={() => {
            setDraftName(board.name);
            setEditing(true);
          }}
          style={{
            border: "none",
            background: "transparent",
            textAlign: "left",
            fontWeight: 600,
            width: "100%",
            padding: 0,
            cursor: "pointer"
          }}
          title="双击重命名"
        >
          {board.name}
        </button>
      )}

      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          aria-label="更多操作"
          onClick={() => setMenuOpen((prev) => !prev)}
          style={{
            border: "none",
            background: "transparent",
            width: 24,
            height: 24,
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            padding: 0
          }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <i style={{ width: 4, height: 4, borderRadius: "50%", background: "#334155", display: "block" }} />
            <i style={{ width: 4, height: 4, borderRadius: "50%", background: "#334155", display: "block" }} />
            <i style={{ width: 4, height: 4, borderRadius: "50%", background: "#334155", display: "block" }} />
          </span>
        </button>
        {menuOpen ? (
          <div
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
      style={{
        width: 280,
        background: "linear-gradient(170deg, rgba(255,255,255,0.48), rgba(255,255,255,0.22))",
        backdropFilter: "blur(22px) saturate(130%)",
        borderRight: "1px solid rgba(255,255,255,0.58)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 14,
        position: "relative"
      }}
    >
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <strong>桌板</strong>
          <Button variant="ghost" onClick={onAddBoard}>
            + 新建
          </Button>
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
