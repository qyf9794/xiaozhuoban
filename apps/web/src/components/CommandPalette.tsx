import { useMemo, useState } from "react";
import type { Board, WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";

interface SearchResultItem {
  type: string;
  title: string;
  action?: () => void;
}

export function CommandPalette({
  open,
  onClose,
  boards,
  definitions,
  widgets,
  onAddWidget
}: {
  open: boolean;
  onClose: () => void;
  boards: Board[];
  definitions: WidgetDefinition[];
  widgets: WidgetInstance[];
  onAddWidget: (definitionId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    const definitionMap = new Map(definitions.map((item) => [item.id, item]));
    const keywordMap: Record<string, string[]> = {
      market: ["股票", "指数", "行情", "股市", "投资", "纳指", "标普", "上证", "深证"],
      countdown: ["时间", "计时", "倒计时", "番茄钟", "专注", "秒表"],
      weather: ["天气", "温度", "风速", "城市", "气温"],
      headline: ["新闻", "热点", "重大新闻", "头条", "时事", "快讯"],
      calculator: ["计算", "算数", "加减乘除", "数学"],
      note: ["便签", "笔记", "记录", "想法"],
      todo: ["待办", "任务", "计划", "清单"],
      music: ["音乐", "歌曲", "播放", "听歌"],
      recorder: ["录音", "语音", "音频"],
      translate: ["翻译", "中英", "英文", "中文"],
      converter: ["单位", "换算", "长度", "温度", "重量"],
      clipboard: ["剪贴板", "复制", "粘贴", "历史"]
    };

    const widgetAddResults = definitions
      .filter((item) => {
        const hitByName =
          item.name.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q);
        const aliases = keywordMap[item.type] ?? [];
        const hitByAlias = aliases.some((word) => word.toLowerCase().includes(q) || q.includes(word.toLowerCase()));
        return hitByName || hitByAlias;
      })
      .map((item): SearchResultItem => ({
        type: "添加小工具",
        title: item.name,
        action: () => {
          onAddWidget(item.id);
          onClose();
        }
      }));

    return [
      ...boards
        .filter((item) => item.name.toLowerCase().includes(q))
        .map((item): SearchResultItem => ({ type: "桌板", title: item.name })),
      ...widgetAddResults,
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
          } as SearchResultItem;
        })
    ];
  }, [boards, definitions, onAddWidget, onClose, query, widgets]);

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
            <button
              key={`${item.title}-${index}`}
              onClick={() => item.action?.()}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                textAlign: "left",
                padding: "6px 2px",
                borderBottom: "1px solid #eef2ff",
                cursor: item.action ? "pointer" : "default"
              }}
            >
              <small style={{ color: "#64748b" }}>{item.type}</small>
              <div>{item.title}</div>
            </button>
          ))}
          {query && results.length === 0 ? <p style={{ color: "#94a3b8" }}>没有匹配结果</p> : null}
        </div>
      </div>
    </div>
  );
}
