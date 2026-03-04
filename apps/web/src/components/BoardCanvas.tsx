import { useMemo, useState } from "react";
import { createLayoutEngine, fromWidgetInstances } from "@xiaozhuoban/layout-engine";
import type { Board, WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { AIFormWidgetView, BuiltinWidgetView } from "../widgets/BuiltinWidgets";

interface DragState {
  id: string;
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
  currentX: number;
  currentY: number;
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

  const dragPosition = useMemo(() => {
    if (!drag) return null;
    return { x: drag.currentX, y: drag.currentY };
  }, [drag]);

  return (
    <div
      style={{
        position: "relative",
        overflow: "auto",
        height: fullscreen ? "100vh" : "calc(100vh - 120px)",
        borderRadius: fullscreen ? 0 : 16,
        userSelect: drag ? "none" : "auto",
        WebkitUserSelect: drag ? "none" : "auto",
        touchAction: "none",
        background:
          board.background.type === "color"
            ? board.background.value
            : `center / cover no-repeat url(${board.background.value})`
      }}
      onPointerMove={(event) => {
        if (!drag || event.pointerId !== drag.pointerId) {
          return;
        }
        const deltaX = event.clientX - drag.lastClientX;
        const deltaY = event.clientY - drag.lastClientY;
        if (deltaX === 0 && deltaY === 0) {
          return;
        }
        const moved = engine.move(drag.id, { x: deltaX, y: deltaY });
        if (!moved) return;
        setDrag((prev) =>
          prev
            ? {
                ...prev,
                lastClientX: event.clientX,
                lastClientY: event.clientY,
                currentX: moved.position.x,
                currentY: moved.position.y
              }
            : prev
        );
      }}
      onPointerUp={(event) => {
        if (!drag || event.pointerId !== drag.pointerId) {
          return;
        }
        onMove(drag.id, drag.currentX, drag.currentY);
        setDrag(null);
      }}
      onPointerCancel={(event) => {
        if (!drag || event.pointerId !== drag.pointerId) {
          return;
        }
        setDrag(null);
      }}
    >
      {widgets.map((widget) => {
        const definition = byId.get(widget.definitionId);
        if (!definition) {
          return null;
        }

        const position = drag?.id === widget.id && dragPosition ? dragPosition : widget.position;

        return (
          <div
            key={widget.id}
            data-widget-id={widget.id}
            style={{
              position: "absolute",
              width: widget.size.w,
              height: widget.size.h,
              left: position.x,
              top: position.y,
              zIndex: widget.zIndex,
              cursor: board.locked ? "default" : drag?.id === widget.id ? "grabbing" : "grab"
            }}
            className="widget-box"
            onPointerDown={(event) => {
              if (board.locked || widget.locked) {
                return;
              }
              const target = event.target as HTMLElement;
              if (target.closest("input, textarea, select, button, [contenteditable='true'], [data-no-drag='true']")) {
                return;
              }

              event.preventDefault();
              const container = event.currentTarget;
              container.setPointerCapture(event.pointerId);
              setDrag({
                id: widget.id,
                pointerId: event.pointerId,
                lastClientX: event.clientX,
                lastClientY: event.clientY,
                currentX: widget.position.x,
                currentY: widget.position.y
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
