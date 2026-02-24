import { useMemo, useState } from "react";
import { createLayoutEngine, fromWidgetInstances } from "@xiaozhuoban/layout-engine";
import type { Board, WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { AIFormWidgetView, BuiltinWidgetView } from "../widgets/BuiltinWidgets";

interface DragState {
  id: string;
  lastX: number;
  lastY: number;
}

export function BoardCanvas({
  board,
  definitions,
  widgets,
  fullscreen = false,
  onMove,
  onStateChange,
  onRemoveWidget
}: {
  board: Board;
  definitions: WidgetDefinition[];
  widgets: WidgetInstance[];
  fullscreen?: boolean;
  onMove: (widgetId: string, x: number, y: number) => void;
  onStateChange: (widgetId: string, state: Record<string, unknown>) => void;
  onRemoveWidget: (widgetId: string) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const engine = useMemo(() => {
    const e = createLayoutEngine(board.layoutMode);
    e.load(fromWidgetInstances(widgets));
    return e;
  }, [board.layoutMode, widgets]);

  const byId = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);

  return (
    <div
      style={{
        position: "relative",
        overflow: "auto",
        height: fullscreen ? "100vh" : "calc(100vh - 120px)",
        borderRadius: fullscreen ? 0 : 16,
        userSelect: drag ? "none" : "auto",
        WebkitUserSelect: drag ? "none" : "auto",
        background:
          board.background.type === "color"
            ? board.background.value
            : `center / cover no-repeat url(${board.background.value})`
      }}
      onMouseMove={(event) => {
        if (!drag) {
          return;
        }
        const deltaX = event.clientX - drag.lastX;
        const deltaY = event.clientY - drag.lastY;
        if (deltaX === 0 && deltaY === 0) {
          return;
        }
        const moved = engine.move(drag.id, { x: deltaX, y: deltaY });
        if (moved) {
          onMove(drag.id, moved.position.x, moved.position.y);
          setDrag({
            id: drag.id,
            lastX: event.clientX,
            lastY: event.clientY
          });
        }
      }}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
    >
      {widgets.map((widget) => {
        const definition = byId.get(widget.definitionId);
        if (!definition) {
          return null;
        }

        return (
          <div
            key={widget.id}
            data-widget-id={widget.id}
            style={{
              position: "absolute",
              width: widget.size.w,
              height: widget.size.h,
              left: widget.position.x,
              top: widget.position.y,
              zIndex: widget.zIndex,
              cursor: board.locked ? "default" : "grab"
            }}
            className="widget-box"
            onMouseDown={(event) => {
              if (board.locked || widget.locked) {
                return;
              }
              const target = event.target as HTMLElement;
              if (
                target.closest(
                  "input, textarea, select, button, [contenteditable='true'], [data-no-drag='true']"
                )
              ) {
                return;
              }
              event.preventDefault();
              setDrag({
                id: widget.id,
                lastX: event.clientX,
                lastY: event.clientY
              });
            }}
          >
            <button
              className="widget-delete-dot"
              data-no-drag="true"
              title="删除小工具"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveWidget(widget.id);
              }}
            >
              ×
            </button>
            {definition.kind === "ai" ? (
              <AIFormWidgetView
                definition={definition}
                instance={widget}
                onStateChange={(nextState) => onStateChange(widget.id, nextState)}
              />
            ) : (
              <BuiltinWidgetView
                definition={definition}
                instance={widget}
                onStateChange={(nextState) => onStateChange(widget.id, nextState)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
