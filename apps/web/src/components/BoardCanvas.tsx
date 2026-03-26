import { useEffect, useMemo, useRef, useState } from "react";
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

interface PendingTouchDragState {
  widget: WidgetInstance;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  captureTarget: Element | null;
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
  const pendingTouchDragRef = useRef<PendingTouchDragState | null>(null);
  const pendingTouchDragTimerRef = useRef<number | null>(null);

  const engine = useMemo(() => {
    const e = createLayoutEngine(board.layoutMode);
    e.load(fromWidgetInstances(widgets));
    return e;
  }, [board.layoutMode, widgets]);

  const byId = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const supportsTouchScroll = useMemo(
    () => typeof navigator !== "undefined" && navigator.maxTouchPoints > 0,
    []
  );
  const useTouchScrollableDesktopCanvas = supportsTouchScroll && !isMobileMode;
  const useFixedViewportBackground = supportsTouchScroll && !isMobileMode;
  const noDragSelector =
    "input, textarea, select, button, video, audio, iframe, [contenteditable='true'], [data-no-drag='true']";

  const dragPosition = useMemo(() => {
    if (!drag) return null;
    return { x: drag.currentX, y: drag.currentY };
  }, [drag]);

  const desktopCanvasBounds = useMemo(() => {
    if (isMobileMode || widgets.length === 0) {
      return null;
    }

    const bounds = widgets.reduce(
      (acc, widget) => {
        const position =
          drag?.id === widget.id && dragPosition
            ? dragPosition
            : {
                x: widget.position.x,
                y: widget.position.y
              };
        const width = resize?.id === widget.id ? resize.currentW : widget.size.w;
        const height = resize?.id === widget.id ? 480 : widget.size.h;
        return {
          maxX: Math.max(acc.maxX, position.x + width),
          maxY: Math.max(acc.maxY, position.y + height)
        };
      },
      { maxX: 0, maxY: 0 }
    );

    return {
      minWidth: Math.max(bounds.maxX + 96, 0),
      minHeight: Math.max(bounds.maxY + 96, 0)
    };
  }, [drag?.id, dragPosition, isMobileMode, resize?.currentW, resize?.id, widgets]);

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
  const startDrag = (
    widget: WidgetInstance,
    pointerId: number,
    clientX: number,
    clientY: number,
    captureTarget: Element | null
  ) => {
    captureTarget?.setPointerCapture?.(pointerId);
    setDrag({
      id: widget.id,
      pointerId,
      lastClientX: clientX,
      lastClientY: clientY,
      currentX: widget.position.x,
      currentY: widget.position.y
    });
  };

  const clearPendingTouchDrag = (pointerId?: number) => {
    const pending = pendingTouchDragRef.current;
    if (!pending || (pointerId !== undefined && pending.pointerId !== pointerId)) {
      return false;
    }
    if (pendingTouchDragTimerRef.current !== null) {
      window.clearTimeout(pendingTouchDragTimerRef.current);
      pendingTouchDragTimerRef.current = null;
    }
    pendingTouchDragRef.current = null;
    return true;
  };

  const scheduleTouchDrag = (
    widget: WidgetInstance,
    pointerId: number,
    clientX: number,
    clientY: number,
    captureTarget: Element | null
  ) => {
    clearPendingTouchDrag();
    pendingTouchDragRef.current = {
      widget,
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      lastClientX: clientX,
      lastClientY: clientY,
      captureTarget
    };
    pendingTouchDragTimerRef.current = window.setTimeout(() => {
      const pending = pendingTouchDragRef.current;
      if (!pending || pending.pointerId !== pointerId || pending.widget.id !== widget.id) {
        return;
      }
      pendingTouchDragTimerRef.current = null;
      pendingTouchDragRef.current = null;
      startDrag(
        pending.widget,
        pending.pointerId,
        pending.lastClientX,
        pending.lastClientY,
        pending.captureTarget
      );
    }, 220);
  };

  useEffect(
    () => () => {
      clearPendingTouchDrag();
    },
    []
  );

  return (
    <div
      className={isMobileMode ? "board-canvas board-canvas-mobile" : "board-canvas"}
      style={{
        position: "relative",
        overflow: isMobileMode ? "visible" : "auto",
        overflowY: isMobileMode ? "visible" : "auto",
        overflowX: isMobileMode ? "visible" : "auto",
        display: isMobileMode ? "flex" : "block",
        flexDirection: isMobileMode ? "column" : "row",
        gap: isMobileMode ? 16 : 0,
        padding: isMobileMode
          ? "calc(env(safe-area-inset-top) + 74px) 14px calc(env(safe-area-inset-bottom) + 84px)"
          : 0,
        minWidth: desktopCanvasBounds?.minWidth,
        minHeight: desktopCanvasBounds?.minHeight ?? 0,
        flex: isMobileMode ? undefined : 1,
        height: isMobileMode ? "auto" : fullscreen ? "100dvh" : "calc(100dvh - 120px)",
        borderRadius: fullscreen ? 0 : 16,
        userSelect: drag || resize ? "none" : "auto",
        WebkitUserSelect: drag || resize ? "none" : "auto",
        WebkitOverflowScrolling: useTouchScrollableDesktopCanvas ? "touch" : undefined,
        overscrollBehaviorX: useTouchScrollableDesktopCanvas ? "contain" : undefined,
        overscrollBehaviorY: useTouchScrollableDesktopCanvas ? "contain" : undefined,
        touchAction: isMobileMode ? "pan-y" : supportsTouchScroll ? "pan-x pan-y" : "none",
        background: "transparent"
      }}
      onPointerMove={
        isMobileMode
          ? undefined
          : (event) => {
              const pendingTouchDrag = pendingTouchDragRef.current;
              if (pendingTouchDrag && event.pointerId === pendingTouchDrag.pointerId) {
                pendingTouchDrag.lastClientX = event.clientX;
                pendingTouchDrag.lastClientY = event.clientY;
                if (
                  Math.hypot(
                    event.clientX - pendingTouchDrag.startClientX,
                    event.clientY - pendingTouchDrag.startClientY
                  ) > 8
                ) {
                  clearPendingTouchDrag(event.pointerId);
                }
              }
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
              if (clearPendingTouchDrag(event.pointerId)) {
                return;
              }
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
              if (clearPendingTouchDrag(event.pointerId)) {
                return;
              }
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
        const isFixedHeightDesktopWidget =
          definition.type === "tv" ||
          definition.type === "worldClock" ||
          definition.type === "messageBoard" ||
          definition.type === "dialClock";
        const isDynamicHeightWidget = !isMobileMode && !isFixedHeightDesktopWidget;
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
              height: isMobileMode || isDynamicHeightWidget ? "auto" : size.h,
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
              if (target.closest(noDragSelector)) {
                return;
              }
              if (event.pointerType === "touch") {
                scheduleTouchDrag(
                  widget,
                  event.pointerId,
                  event.clientX,
                  event.clientY,
                  event.currentTarget
                );
                return;
              }

              event.preventDefault();
              startDrag(widget, event.pointerId, event.clientX, event.clientY, event.currentTarget);
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
                  if (event.pointerType === "touch") return;
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
                isMobileMode={isMobileMode}
                onStateChange={(nextState) => onStateChange(widget.id, nextState)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
