import { describe, expect, it } from "vitest";
import {
  buildDialClockMarkStates,
  DIAL_CLOCK_SWEEP_CATCHUP_WINDOW_MS,
  DIAL_CLOCK_SWEEP_PHRASE_PAUSE_MS,
  DIAL_CLOCK_SWEEP_TOTAL_DURATION_MS,
  getDialClockSweepTriggerKey,
  getDialClockSweepFrames,
  getDialClockSweepPhraseDurations,
  shouldTriggerDialClockSweep,
  toDialClockTimeState
} from "./dialClockShared";

describe("toDialClockTimeState", () => {
  it("maps midnight to 12 AM", () => {
    expect(toDialClockTimeState(new Date("2026-03-26T00:08:12"))).toMatchObject({
      hourNumber: 12,
      minuteIndex: 8,
      secondIndex: 12,
      isAm: true,
      isOnHour: false
    });
  });

  it("switches AM and PM around noon", () => {
    expect(toDialClockTimeState(new Date("2026-03-26T11:59:59"))).toMatchObject({
      hourNumber: 11,
      isAm: true
    });
    expect(toDialClockTimeState(new Date("2026-03-26T12:00:00"))).toMatchObject({
      hourNumber: 12,
      isAm: false
    });
    expect(toDialClockTimeState(new Date("2026-03-26T23:59:59"))).toMatchObject({
      hourNumber: 11,
      isAm: false
    });
  });
});

describe("shouldTriggerDialClockSweep", () => {
  it("only triggers on the exact hour", () => {
    expect(shouldTriggerDialClockSweep(new Date("2026-03-26T05:00:00"))).toBe(true);
    expect(shouldTriggerDialClockSweep(new Date("2026-03-26T05:00:01"))).toBe(false);
    expect(shouldTriggerDialClockSweep(new Date("2026-03-26T05:01:00"))).toBe(false);
  });
});

describe("getDialClockSweepTriggerKey", () => {
  it("returns the current hour key on the exact hour", () => {
    expect(getDialClockSweepTriggerKey(null, new Date("2026-03-26T05:00:00"))).toBe("2026-2-26-5");
  });

  it("catches a recently crossed hour without replaying late", () => {
    expect(
      getDialClockSweepTriggerKey(
        new Date("2026-03-26T04:59:59"),
        new Date("2026-03-26T05:00:03"),
        DIAL_CLOCK_SWEEP_CATCHUP_WINDOW_MS
      )
    ).toBe("2026-2-26-5");

    expect(
      getDialClockSweepTriggerKey(
        new Date("2026-03-26T04:59:59"),
        new Date("2026-03-26T05:05:00"),
        DIAL_CLOCK_SWEEP_CATCHUP_WINDOW_MS
      )
    ).toBeNull();
  });
});

describe("getDialClockSweepFrames", () => {
  it("creates the requested four-swing pendulum sequence", () => {
    const frames = getDialClockSweepFrames();

    expect(frames[0]).toMatchObject({ headIndex: 0, phraseIndex: 0, isPhraseEnd: false });
    const firstPhrase = frames.filter((frame) => frame.phraseIndex === 0);
    const firstPhraseAtThirty = firstPhrase.find((frame) => frame.headIndex === 30);
    expect(firstPhrase[0]?.frameDurationMs).toBeGreaterThan(firstPhraseAtThirty?.frameDurationMs ?? 0);
    expect(firstPhrase.at(-1)?.frameDurationMs).toBeGreaterThan(firstPhraseAtThirty?.frameDurationMs ?? 0);
    expect(frames.some((frame) => frame.phraseIndex === 0 && frame.trail.length === 12)).toBe(true);
    expect(frames.find((frame) => frame.headIndex === 43 && frame.phraseIndex === 0)).toMatchObject({
      isPhraseEnd: true,
      trail: [43, 42]
    });
    expect(frames.find((frame) => frame.headIndex === 43 && frame.phraseIndex === 1 && !frame.isPhraseEnd)).toMatchObject({
      trail: [43, 42]
    });
    expect(frames.find((frame) => frame.headIndex === 17 && frame.phraseIndex === 1)).toMatchObject({
      isPhraseEnd: true,
      trail: [17, 18]
    });
    expect(frames.find((frame) => frame.headIndex === 17 && frame.phraseIndex === 2 && !frame.isPhraseEnd)).toMatchObject({
      trail: [17, 18]
    });
    expect(frames.at(-1)).toMatchObject({ headIndex: 17, phraseIndex: 3, isPhraseEnd: true });
  });

  it("returns one phrase duration per swing", () => {
    const durations = getDialClockSweepPhraseDurations();
    expect(durations).toHaveLength(4);
    expect(durations[0]).toBe(durations[1]);
    expect(durations[1]).toBe(durations[2]);
    expect(durations[2]).toBe(durations[3]);
    expect(durations.reduce((sum, value) => sum + value, 0) + DIAL_CLOCK_SWEEP_PHRASE_PAUSE_MS * 3).toBe(
      DIAL_CLOCK_SWEEP_TOTAL_DURATION_MS
    );
  });
});

describe("buildDialClockMarkStates", () => {
  it("lights only the current minute mark and renders a three-step second tail", () => {
    const state = toDialClockTimeState(new Date("2026-03-26T09:34:21"));
    const marks = buildDialClockMarkStates(state);

    expect(marks.filter((mark) => mark.minuteActive)).toHaveLength(1);
    expect(marks[34]).toMatchObject({ minuteActive: true, secondTrailLevel: null });
    expect(marks[21]).toMatchObject({ minuteActive: false, secondTrailLevel: 0 });
    expect(marks[20]).toMatchObject({ minuteActive: false, secondTrailLevel: 1 });
    expect(marks[19]).toMatchObject({ minuteActive: false, secondTrailLevel: 2 });
    expect(marks[35]).toMatchObject({ minuteActive: false, secondTrailLevel: null });
  });

  it("applies sweep states on top of normal time states", () => {
    const state = toDialClockTimeState(new Date("2026-03-26T06:00:00"));
    const marks = buildDialClockMarkStates(state, {
      headIndex: 46,
      trail: [46, 45, 44],
      phraseIndex: 0,
      isPhraseEnd: false,
      frameDurationMs: 96
    });

    expect(marks[46]).toMatchObject({ minuteActive: false, secondTrailLevel: null, sweepTrailLevel: 0 });
    expect(marks[45]).toMatchObject({ minuteActive: false, secondTrailLevel: null, sweepTrailLevel: 1 });
    expect(marks[44]).toMatchObject({ minuteActive: false, secondTrailLevel: null, sweepTrailLevel: 2 });
    expect(marks[0]).toMatchObject({ minuteActive: true, secondTrailLevel: 0, sweepTrailLevel: null });
    expect(marks[59]).toMatchObject({ minuteActive: false, secondTrailLevel: 1, sweepTrailLevel: null });
  });
});
