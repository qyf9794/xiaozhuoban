import { useMemo, useState } from "react";
import { createLayoutEngine, fromWidgetInstances } from "@xiaozhuoban/layout-engine";
import type { Board, WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { AIFormWidgetView, BuiltinWidgetView } from "../widgets/BuiltinWidgets";
import { clampTvWidgetSize } from "../widgets/tvShared";

interface DragState {
  id: string;
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
  currentX: number;
  currentY: number;
}

interface ResizeState {
  id: string;
  pointerId: number;
  startClientX: number;
  startW: number;
  currentW: number;
}

export function BoardCanvas({
  board,
  definitions,
  widgets,
  fullscreen = false,
  isMobileMode = false,
  onMove,
  onResize,
  onStateChange,
  onRemoveWidget
}: {
  board: Board;
  definitions: WidgetDefinition[];
  widgets: WidgetInstance[];
  fullscreen?: boolean;
  isMobileMode?: boolean;
  onMove: (widgetId: string, x: number, y: number) => void;
  onResize: (widgetId: string, w: number, h: number) => void;
  onStateChange: (widgetId: string, state: Record<string, unknown>) => void;
  onRemoveWidget: (widgetId: string) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);

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

  const mobileWidgets = useMemo(
    () =>
      [...widgets].sort((a, b) => {
        if (a.position.y !== b.position.y) return a.position.y - b.position.y;
        if (a.position.x !== b.position.x) return a.position.x - b.position.x;
        return a.zIndex - b.zIndex;
      }),
    [widgets]
  );

  const renderedWidgets = isMobileMode ? mobileWidgets : widgets;

  return (
    <div
      className={isMobileMode ? "board-canvas board-canvas-mobile" : "board-canvas"}
      style={{
        position: "relative",
        overflow: isMobileMode ? "visible" : "auto",
        overflowX: isMobileMode ? "visible" : "auto",
        display: isMobileMode ? "flex" : "block",
        flexDirection: isMobileMode ? "column" : "row",
        gap: isMobileMode ? 16 : 0,
        padding: isMobileMode
          ? "calc(env(safe-area-inset-top) + 74px) 14px calc(env(safe-area-inset-bottom) + 84px)"
          : 0,
        minHeight: 0,
        height: isMobileMode ? "auto" : fullscreen ? "100dvh" : "calc(100vh - 120px)",
        borderRadius: fullscreen ? 0 : 16,
        userSelect: drag || resize ? "none" : "auto",
        WebkitUserSelect: drag || resize ? "none" : "auto",
        touchAction: isMobileMode ? "pan-y" : "none",
        background:
          isMobileMode
            ? "transparent"
            : board.background.type === "color"
              ? board.background.value
              : `center / cover no-repeat url(${board.background.value})`
      }}
      onPointerMove={
        isMobileMode
          ? undefined
          : (event) => {
              if (resize && event.pointerId === resize.pointerId) {
                const deltaX = event.clientX - resize.startClientX;
                const next = clampTvWidgetSize(resize.startW + deltaX, 480);
                setResize((prev) =>
                  prev
                    ? {
                        ...prev,
                        currentW: next.w
                      }
                    : prev
                );
                return;
              }
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
            }
      }
      onPointerUp={
        isMobileMode
          ? undefined
          : (event) => {
              if (resize && event.pointerId === resize.pointerId) {
                onResize(resize.id, resize.currentW, 480);
                setResize(null);
                return;
              }
              if (!drag || event.pointerId !== drag.pointerId) {
                return;
              }
              onMove(drag.id, drag.currentX, drag.currentY);
              setDrag(null);
            }
      }
      onPointerCancel={
        isMobileMode
          ? undefined
          : (event) => {
              if (resize && event.pointerId === resize.pointerId) {
                setResize(null);
                return;
              }
              if (!drag || event.pointerId !== drag.pointerId) {
                return;
              }
              setDrag(null);
            }
      }
    >
      {renderedWidgets.map((widget) => {
        const definition = byId.get(widget.definitionId);
        if (!definition) {
          return null;
        }

        const position = drag?.id === widget.id && dragPosition ? dragPosition : widget.position;
        const isTvWidget = definition.type === "tv";
        const baseSize = isTvWidget ? clampTvWidgetSize(widget.size.w, 480) : widget.size;
        const size =
          resize?.id === widget.id
            ? {
                w: resize.currentW,
                h: 480
              }
            : baseSize;

        return (
          <div
            key={widget.id}
            data-widget-id={widget.id}
            style={{
              position: isMobileMode ? "relative" : "absolute",
              width: isMobileMode ? "min(350px, 100%)" : size.w,
              height: isMobileMode ? "auto" : size.h,
              left: isMobileMode ? undefined : position.x,
              top: isMobileMode ? undefined : position.y,
              zIndex: isMobileMode ? "auto" : widget.zIndex,
              cursor: isMobileMode ? "default" : board.locked ? "default" : drag?.id === widget.id ? "grabbing" : "grab",
              margin: isMobileMode ? "0 auto" : undefined
            }}
            className={isMobileMode ? "widget-box widget-box-mobile" : "widget-box"}
            onPointerDown={(event) => {
              if (isMobileMode || resize || board.locked || widget.locked) {
                return;
              }
              const target = event.target as HTMLElement;
              if (
                target.closest(
                  "input, textarea, select, button, video, audio, iframe, [contenteditable='true'], [data-no-drag='true']"
                )
              ) {
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
            {isTvWidget && !isMobileMode ? (
              <div
                className="widget-resize-edge"
                data-no-drag="true"
                title="拖拽调整大小"
                onPointerDown={(event) => {
                  if (board.locked || widget.locked) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const start = clampTvWidgetSize(baseSize.w, 480);
                  setResize({
                    id: widget.id,
                    pointerId: event.pointerId,
                    startClientX: event.clientX,
                    startW: start.w,
                    currentW: start.w
                  });
                }}
              />
            ) : null}
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
