import { describe, expect, it } from "vitest";
import type { WidgetInstance } from "@xiaozhuoban/domain";
import { sortWidgetsForStackedPresentation } from "./BoardCanvas";

function widget(id: string, x: number, y: number, zIndex: number): WidgetInstance {
  return {
    id,
    boardId: "board_1",
    definitionId: "definition_1",
    position: { x, y },
    size: { w: 260, h: 180 },
    zIndex,
    locked: false,
    state: {},
    bindings: [],
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z"
  };
}

describe("BoardCanvas workbench presentation", () => {
  it("creates a mobile-order view without mutating persisted widget geometry", () => {
    const original = [widget("later", 20, 300, 2), widget("first", 40, 20, 3), widget("middle", 10, 300, 1)];
    const snapshot = structuredClone(original);

    const sorted = sortWidgetsForStackedPresentation(original);

    expect(sorted.map((item) => item.id)).toEqual(["first", "middle", "later"]);
    expect(original).toEqual(snapshot);
    expect(sorted[0]).toBe(original[1]);
  });
});
