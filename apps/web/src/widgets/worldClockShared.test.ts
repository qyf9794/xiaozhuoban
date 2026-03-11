import { describe, expect, it } from "vitest";
import {
  CHINA_TIME_ZONE,
  DEFAULT_WORLD_CLOCK_ZONES,
  formatWorldClockDisplay,
  getWorldClockLayoutClass,
  getRandomWorldClockToneClasses,
  normalizeWorldClockZones,
  toWorldClockSlots,
  updateWorldClockSlot
} from "./worldClockShared";

describe("normalizeWorldClockZones", () => {
  it("falls back to the default zones and keeps China first", () => {
    expect(normalizeWorldClockZones(undefined)).toEqual([...DEFAULT_WORLD_CLOCK_ZONES]);
  });

  it("deduplicates zones, removes invalid entries, and fills to four clocks", () => {
    expect(
      normalizeWorldClockZones([
        "America/New_York",
        CHINA_TIME_ZONE,
        "America/New_York",
        "Mars/Base"
      ])
    ).toEqual([CHINA_TIME_ZONE, "America/New_York", "America/Los_Angeles", "Europe/London"]);
  });
});

describe("world clock slots", () => {
  it("always returns four slots", () => {
    expect(toWorldClockSlots([CHINA_TIME_ZONE, "America/New_York"])).toEqual([
      CHINA_TIME_ZONE,
      "America/New_York",
      "America/Los_Angeles",
      "Europe/London"
    ]);
  });

  it("updates a slot and preserves unique zones", () => {
    expect(updateWorldClockSlot([CHINA_TIME_ZONE, "America/New_York"], 2, "Asia/Tokyo")).toEqual([
      CHINA_TIME_ZONE,
      "America/New_York",
      "Asia/Tokyo",
      "Europe/London"
    ]);
    expect(updateWorldClockSlot([CHINA_TIME_ZONE, "America/New_York"], 2, "America/New_York")).toEqual([
      CHINA_TIME_ZONE,
      "America/New_York",
      "America/Los_Angeles",
      "Europe/London"
    ]);
  });
});

describe("world clock layout", () => {
  it("always uses the quad layout", () => {
    expect(getWorldClockLayoutClass(1)).toBe("world-clock-grid-quad");
    expect(getWorldClockLayoutClass(2)).toBe("world-clock-grid-quad");
    expect(getWorldClockLayoutClass(3)).toBe("world-clock-grid-quad");
    expect(getWorldClockLayoutClass(4)).toBe("world-clock-grid-quad");
  });

  it("returns four unique glow tone classes", () => {
    const tones = getRandomWorldClockToneClasses();
    expect(new Set(tones).size).toBe(4);
  });
});

describe("formatWorldClockDisplay", () => {
  it("formats time for a zone", () => {
    const display = formatWorldClockDisplay(new Date("2026-03-11T12:34:56.000Z"), CHINA_TIME_ZONE);
    expect(display.time).toBe("20:34");
    expect(display.offset).toMatch(/^GMT[+-]/);
  });

  it("reflects daylight saving changes in New York", () => {
    const winter = formatWorldClockDisplay(new Date("2026-01-15T12:00:00.000Z"), "America/New_York");
    const summer = formatWorldClockDisplay(new Date("2026-07-15T12:00:00.000Z"), "America/New_York");

    expect(winter.offset).not.toBe(summer.offset);
  });

  it("reflects daylight saving changes in London", () => {
    const winter = formatWorldClockDisplay(new Date("2026-01-15T12:00:00.000Z"), "Europe/London");
    const summer = formatWorldClockDisplay(new Date("2026-07-15T12:00:00.000Z"), "Europe/London");

    expect(winter.offset).not.toBe(summer.offset);
  });
});
