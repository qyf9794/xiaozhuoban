import { beforeEach, describe, expect, it } from "vitest";
import { useWorkbenchStore } from "./store";

describe("workbench presentation store", () => {
  beforeEach(() => {
    useWorkbenchStore.setState({ open: false, toolWindows: [], fullscreenPanel: null });
  });

  it("derives desktop and mobile modes without touching board layout state", () => {
    expect(useWorkbenchStore.getState().presentationMode(false)).toBe("closed");
    useWorkbenchStore.getState().setOpen(true);
    expect(useWorkbenchStore.getState().presentationMode(false)).toBe("desktop-rail");
    expect(useWorkbenchStore.getState().presentationMode(true)).toBe("mobile-push");
    useWorkbenchStore.getState().setOpen(false);
    expect(useWorkbenchStore.getState().presentationMode(false)).toBe("closed");
  });

  it("keeps floating tool windows isolated and idempotent", () => {
    useWorkbenchStore.getState().openToolWindow("whiteboard");
    useWorkbenchStore.getState().openToolWindow("whiteboard");
    expect(useWorkbenchStore.getState().toolWindows).toEqual(["whiteboard"]);
    useWorkbenchStore.getState().closeToolWindow("whiteboard");
    expect(useWorkbenchStore.getState().toolWindows).toEqual([]);
  });
});
