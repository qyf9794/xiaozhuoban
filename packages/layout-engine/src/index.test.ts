import { describe, expect, it } from "vitest";
import { FreeLayoutEngine, createLayoutEngine } from "./index";

describe("FreeLayoutEngine", () => {
  it("moves without snapping and hitTest works", () => {
    const engine = new FreeLayoutEngine();
    engine.load([{ id: "a", position: { x: 10, y: 10 }, size: { w: 100, h: 100 } }]);

    const moved = engine.move("a", { x: 5, y: 7 });
    expect(moved?.position).toEqual({ x: 15, y: 17 });

    const hit = engine.hitTest({ x: 20, y: 20 });
    expect(hit?.id).toBe("a");
  });
});

describe("createLayoutEngine", () => {
  it("always returns free layout engine", () => {
    const free = createLayoutEngine("free");
    const grid = createLayoutEngine("grid");

    expect(free.mode).toBe("free");
    expect(grid.mode).toBe("free");
  });
});
