import { describe, expect, it } from "vitest";
import { FreeLayoutEngine, GridLayoutEngine } from "./index";

describe("GridLayoutEngine", () => {
  it("snaps movement to grid", () => {
    const engine = new GridLayoutEngine(10);
    engine.load([
      { id: "a", position: { x: 0, y: 0 }, size: { w: 10, h: 10 } }
    ]);

    const moved = engine.move("a", { x: 8, y: 17 });
    expect(moved?.position).toEqual({ x: 10, y: 20 });
  });

  it("serialize is deterministic", () => {
    const engine = new GridLayoutEngine();
    engine.load([
      { id: "b", position: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
      { id: "a", position: { x: 0, y: 0 }, size: { w: 1, h: 1 } }
    ]);
    expect(engine.serialize().map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("FreeLayoutEngine", () => {
  it("moves without snapping and hitTest works", () => {
    const engine = new FreeLayoutEngine();
    engine.load([
      { id: "a", position: { x: 10, y: 10 }, size: { w: 100, h: 100 } }
    ]);

    const moved = engine.move("a", { x: 5, y: 7 });
    expect(moved?.position).toEqual({ x: 15, y: 17 });

    const hit = engine.hitTest({ x: 20, y: 20 });
    expect(hit?.id).toBe("a");
  });
});
