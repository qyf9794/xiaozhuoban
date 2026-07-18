import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaPlaybackErrorCode, waitForPlaybackProgress } from "./mediaPlaybackVerification";

describe("waitForPlaybackProgress", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("only verifies playback after the media clock advances", async () => {
    vi.useFakeTimers();
    let currentTime = 4;
    const verification = waitForPlaybackProgress(() => currentTime, {
      timeoutMs: 500,
      pollIntervalMs: 25,
      minimumAdvanceSeconds: 0.05
    });

    await vi.advanceTimersByTimeAsync(25);
    currentTime = 4.08;
    await vi.advanceTimersByTimeAsync(25);

    const result = await verification;
    expect(result).toMatchObject({ verified: true, startTime: 4, endTime: 4.08 });
    expect(result.advancedBy).toBeCloseTo(0.08);
  });

  it("rejects a player whose media clock remains stalled", async () => {
    vi.useFakeTimers();
    const verification = waitForPlaybackProgress(() => 0, {
      timeoutMs: 100,
      pollIntervalMs: 20
    });

    await vi.advanceTimersByTimeAsync(120);

    await expect(verification).resolves.toMatchObject({
      verified: false,
      startTime: 0,
      endTime: 0,
      advancedBy: 0
    });
  });
});

describe("mediaPlaybackErrorCode", () => {
  it("distinguishes autoplay policy rejection from media failures", () => {
    expect(mediaPlaybackErrorCode(new DOMException("blocked", "NotAllowedError"))).toBe("BROWSER_PLAYBACK_BLOCKED");
    expect(mediaPlaybackErrorCode(new DOMException("unsupported", "NotSupportedError"))).toBe("MUSIC_PLAY_FAILED");
    expect(mediaPlaybackErrorCode(new Error("network"))).toBe("MUSIC_PLAY_FAILED");
  });
});
