import { createId, nowIso, type WidgetDefinition, type WidgetInstance } from "@xiaozhuoban/domain";
import { clampTvWidgetSize } from "../widgets/tvShared";

export const MOBILE_STACK_MARGIN = 20;
export const MOBILE_STACK_GAP = 16;
export const DEFAULT_BOARD_WIDGET_OFFSET = 20;
const DESKTOP_WIDGET_COLUMN_GAP = 20;
const DESKTOP_COLUMN_LEFT_TOLERANCE = 48;

export function getDefaultWidgetSize(type?: string): { w: number; h: number } {
  if (type === "tv") {
    return { w: 240, h: 480 };
  }
  if (type === "gomoku") {
    return { w: 498, h: 640 };
  }
  if (type === "monopoly") {
    return { w: 498, h: 640 };
  }
  if (type === "guandan") {
    return { w: 498, h: 640 };
  }
  if (type === "worldClock") {
    return { w: 240, h: 240 };
  }
  if (type === "dialClock") {
    return { w: 240, h: 240 };
  }
  if (type === "headline") {
    return { w: 240, h: 320 };
  }
  if (type === "weather") {
    return { w: 240, h: 260 };
  }
  if (type === "messageBoard") {
    return { w: 240, h: 500 };
  }
  return { w: 240, h: 180 };
}

export function buildDefinitionTypeMap(definitions: WidgetDefinition[]) {
  return new Map(definitions.map((item) => [item.id, item.type]));
}

export function safeWidgetWidth(widget: WidgetInstance, definitionType?: string) {
  const normalized = Math.max(120, Number(widget.size.w) || 240);
  if (definitionType === "dialClock") {
    return Math.max(180, Math.min(640, normalized));
  }
  return definitionType === "tv" ? clampTvWidgetSize(normalized, 480).w : normalized;
}

export function safeWidgetHeight(widget: WidgetInstance, definitionType?: string) {
  if (definitionType === "tv") {
    return 480;
  }
  if (definitionType === "messageBoard") {
    return Math.max(260, Math.min(760, Number(widget.size.h) || 500));
  }
  if (definitionType === "dialClock") {
    return Math.max(160, Math.min(760, Number(widget.size.h) || 240));
  }
  if (definitionType === "weather") {
    return Math.max(160, Number(widget.size.h) || 260);
  }
  if (definitionType === "gomoku") {
    return Math.max(560, Number(widget.size.h) || 640);
  }
  if (definitionType === "monopoly") {
    return Math.max(560, Number(widget.size.h) || 640);
  }
  if (definitionType === "guandan") {
    return Math.max(560, Number(widget.size.h) || 640);
  }
  return Math.max(90, Number(widget.size.h) || 180);
}

function normalizeWidgetInstanceSize(widget: WidgetInstance, definitionType?: string): WidgetInstance {
  if (definitionType !== "messageBoard" && definitionType !== "weather" && definitionType !== "dialClock") {
    return widget;
  }
  const nextWidth = safeWidgetWidth(widget, definitionType);
  const nextHeight = safeWidgetHeight(widget, definitionType);
  if (widget.size.w === nextWidth && widget.size.h === nextHeight) {
    return widget;
  }
  return {
    ...widget,
    size: {
      w: nextWidth,
      h: nextHeight
    },
    updatedAt: nowIso()
  };
}

export function normalizeWidgetInstances(
  widgets: WidgetInstance[],
  definitionTypeById: Map<string, string>
): { items: WidgetInstance[]; changed: WidgetInstance[] } {
  const items = widgets.map((widget) => normalizeWidgetInstanceSize(widget, definitionTypeById.get(widget.definitionId)));
  const changed = items.filter((item, index) => item !== widgets[index]);
  return { items, changed };
}

export function toCanvasContentPosition(
  rect: { top: number; left: number },
  canvas: { top: number; left: number; scrollTop: number; scrollLeft: number; paddingTop: number; paddingLeft: number }
) {
  return {
    top: rect.top - canvas.top + canvas.scrollTop - canvas.paddingTop,
    left: rect.left - canvas.left + canvas.scrollLeft - canvas.paddingLeft
  };
}

export function measureWidgetLayout(
  widgets: WidgetInstance[],
  definitionTypeById: Map<string, string>
): Map<string, { top: number; left: number; height: number }> {
  if (typeof document === "undefined") {
    return new Map();
  }

  return new Map(
    widgets.map((item) => {
      const element = document.querySelector<HTMLElement>(`.widget-box[data-widget-id="${item.id}"]`);
      const canvas = element?.closest<HTMLElement>(".board-canvas");
      const rect = element?.getBoundingClientRect();
      const card = element?.querySelector<HTMLElement>("section");
      const cardRect = card?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      const canvasStyles = canvas ? window.getComputedStyle(canvas) : null;
      const canvasPaddingTop = canvasStyles ? Number.parseFloat(canvasStyles.paddingTop) || 0 : 0;
      const canvasPaddingLeft = canvasStyles ? Number.parseFloat(canvasStyles.paddingLeft) || 0 : 0;
      const canvasPosition =
        rect && canvasRect && canvas
          ? toCanvasContentPosition(
              { top: rect.top, left: rect.left },
              {
                top: canvasRect.top,
                left: canvasRect.left,
                scrollTop: canvas.scrollTop,
                scrollLeft: canvas.scrollLeft,
                paddingTop: canvasPaddingTop,
                paddingLeft: canvasPaddingLeft
              }
            )
          : null;
      const top = canvasPosition?.top ?? item.position.y;
      const left = canvasPosition?.left ?? item.position.x;
      const renderedHeight = Math.max(rect?.height ?? 0, cardRect?.height ?? 0);
      const height = renderedHeight > 0 ? renderedHeight : safeWidgetHeight(item, definitionTypeById.get(item.definitionId));
      return [item.id, { top, left, height }];
    })
  );
}

export function getNextMobileWidgetPosition(
  widgets: WidgetInstance[],
  definitionTypeById: Map<string, string>
): { x: number; y: number } {
  if (widgets.length === 0) {
    return { x: MOBILE_STACK_MARGIN, y: MOBILE_STACK_MARGIN };
  }

  const measured = measureWidgetLayout(widgets, definitionTypeById);
  const maxBottom = widgets.reduce((currentMax, item) => {
    const layout = measured.get(item.id);
    const height = layout?.height ?? safeWidgetHeight(item, definitionTypeById.get(item.definitionId));
    const top = layout?.top ?? item.position.y;
    return Math.max(currentMax, top + height);
  }, MOBILE_STACK_MARGIN - MOBILE_STACK_GAP);

  return {
    x: MOBILE_STACK_MARGIN,
    y: Math.round(maxBottom + MOBILE_STACK_GAP)
  };
}

export function getNextDesktopWidgetPosition(
  widgets: WidgetInstance[],
  definitionTypeById: Map<string, string>
): { x: number; y: number } {
  if (widgets.length === 0) {
    return { x: DEFAULT_BOARD_WIDGET_OFFSET, y: DEFAULT_BOARD_WIDGET_OFFSET };
  }

  let rightmostWidget = widgets[0]!;
  let rightmostRight = rightmostWidget.position.x + safeWidgetWidth(rightmostWidget, definitionTypeById.get(rightmostWidget.definitionId));

  for (const widget of widgets.slice(1)) {
    const right = widget.position.x + safeWidgetWidth(widget, definitionTypeById.get(widget.definitionId));
    if (right > rightmostRight || (right === rightmostRight && widget.position.y < rightmostWidget.position.y)) {
      rightmostWidget = widget;
      rightmostRight = right;
    }
  }

  const rightmostColumnLeft = rightmostWidget.position.x;
  const rightmostColumnTop = widgets
    .filter((widget) => Math.abs(widget.position.x - rightmostColumnLeft) <= DESKTOP_COLUMN_LEFT_TOLERANCE)
    .reduce((top, widget) => Math.min(top, widget.position.y), rightmostWidget.position.y);

  return {
    x: Math.round(rightmostRight + DESKTOP_WIDGET_COLUMN_GAP),
    y: Math.max(DEFAULT_BOARD_WIDGET_OFFSET, Math.round(rightmostColumnTop))
  };
}

function createDefaultMessageBoardInstance(
  boardId: string,
  definitionId: string,
  zIndex = 1
): WidgetInstance {
  const now = nowIso();
  return {
    id: createId("wi"),
    boardId,
    definitionId,
    state: {},
    bindings: [],
    position: { x: DEFAULT_BOARD_WIDGET_OFFSET, y: DEFAULT_BOARD_WIDGET_OFFSET },
    size: { w: 240, h: 500 },
    zIndex,
    locked: false,
    createdAt: now,
    updatedAt: now
  };
}

export function createDefaultBoardWidgets(boardId: string, definitions: WidgetDefinition[]): WidgetInstance[] {
  const messageBoardDef = definitions.find((item) => item.kind === "system" && item.type === "messageBoard");
  if (!messageBoardDef) {
    return [];
  }
  return [createDefaultMessageBoardInstance(boardId, messageBoardDef.id)];
}
