import type { LayoutMode, Point, Size, WidgetInstance } from "@xiaozhuoban/domain";

export interface LayoutItem {
  id: string;
  position: Point;
  size: Size;
  locked?: boolean;
}

export interface LayoutEngine {
  readonly mode: LayoutMode;
  load(items: LayoutItem[]): void;
  move(id: string, delta: Point): LayoutItem | null;
  resize(id: string, size: Size): LayoutItem | null;
  serialize(): LayoutItem[];
  hitTest(point: Point): LayoutItem | null;
}

abstract class BaseEngine implements LayoutEngine {
  protected items = new Map<string, LayoutItem>();

  constructor(public readonly mode: LayoutMode) {}

  load(items: LayoutItem[]): void {
    this.items = new Map(items.map((item) => [item.id, { ...item }]));
  }

  move(id: string, delta: Point): LayoutItem | null {
    const item = this.items.get(id);
    if (!item || item.locked) {
      return null;
    }
    const next = this.onMove(item, delta);
    this.items.set(id, next);
    return next;
  }

  resize(id: string, size: Size): LayoutItem | null {
    const item = this.items.get(id);
    if (!item || item.locked) {
      return null;
    }
    const next: LayoutItem = {
      ...item,
      size: {
        w: Math.max(1, size.w),
        h: Math.max(1, size.h)
      }
    };
    this.items.set(id, next);
    return next;
  }

  serialize(): LayoutItem[] {
    return [...this.items.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  hitTest(point: Point): LayoutItem | null {
    for (const item of this.items.values()) {
      if (
        point.x >= item.position.x &&
        point.y >= item.position.y &&
        point.x <= item.position.x + item.size.w &&
        point.y <= item.position.y + item.size.h
      ) {
        return item;
      }
    }
    return null;
  }

  protected abstract onMove(item: LayoutItem, delta: Point): LayoutItem;
}

export class GridLayoutEngine extends BaseEngine {
  constructor(private readonly step = 8) {
    super("grid");
  }

  protected onMove(item: LayoutItem, delta: Point): LayoutItem {
    const nextX = item.position.x + delta.x;
    const nextY = item.position.y + delta.y;
    return {
      ...item,
      position: {
        x: Math.max(0, Math.round(nextX / this.step) * this.step),
        y: Math.max(0, Math.round(nextY / this.step) * this.step)
      }
    };
  }
}

export class FreeLayoutEngine extends BaseEngine {
  constructor() {
    super("free");
  }

  protected onMove(item: LayoutItem, delta: Point): LayoutItem {
    return {
      ...item,
      position: {
        x: Math.max(0, item.position.x + delta.x),
        y: Math.max(0, item.position.y + delta.y)
      }
    };
  }
}

export function createLayoutEngine(mode: LayoutMode): LayoutEngine {
  return mode === "grid" ? new GridLayoutEngine() : new FreeLayoutEngine();
}

export function fromWidgetInstances(widgets: WidgetInstance[]): LayoutItem[] {
  return widgets.map((widget) => ({
    id: widget.id,
    position: widget.position,
    size: widget.size,
    locked: widget.locked
  }));
}
