import { useMemo, useState } from "react";
import type { Board, WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";

export function CommandPalette({
  open,
  onClose,
  boards,
  definitions,
  widgets
}: {
  open: boolean;
  onClose: () => void;
  boards: Board[];
  definitions: WidgetDefinition[];
  widgets: WidgetInstance[];
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    const definitionMap = new Map(definitions.map((item) => [item.id, item]));

    return [
      ...boards.filter((item) => item.name.toLowerCase().includes(q)).map((item) => ({ type: "桌板", title: item.name })),
      ...widgets
        .filter((item) => {
          const d = definitionMap.get(item.definitionId);
          if (!d) return false;
          const text = JSON.stringify(item.state).toLowerCase();
          return d.name.toLowerCase().includes(q) || text.includes(q);
        })
        .map((item) => {
          const d = definitionMap.get(item.definitionId);
          return {
            type: "Widget",
            title: d?.name ?? item.definitionId
          };
        })
    ];
  }, [boards, definitions, query, widgets]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>全局搜索</h2>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索桌板、Widget 内容"
          style={{ width: "100%", borderRadius: 10, border: "1px solid #cbd5e1", padding: "8px 10px" }}
        />
        <div style={{ marginTop: 12, maxHeight: 260, overflow: "auto" }}>
          {results.map((item, index) => (
            <div key={`${item.title}-${index}`} style={{ padding: "6px 2px", borderBottom: "1px solid #eef2ff" }}>
              <small style={{ color: "#64748b" }}>{item.type}</small>
              <div>{item.title}</div>
            </div>
          ))}
          {query && results.length === 0 ? <p style={{ color: "#94a3b8" }}>没有匹配结果</p> : null}
        </div>
      </div>
    </div>
  );
}
