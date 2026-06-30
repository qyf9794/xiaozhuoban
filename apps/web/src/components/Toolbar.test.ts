import { describe, expect, it } from "vitest";
import { shouldOpenSettingsMenuForRequest } from "./Toolbar";

describe("Toolbar", () => {
  it("opens settings only for explicit settings requests", () => {
    expect(shouldOpenSettingsMenuForRequest(undefined)).toBe(false);
    expect(shouldOpenSettingsMenuForRequest(0)).toBe(false);
    expect(shouldOpenSettingsMenuForRequest(1)).toBe(true);
  });
});
