import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mediaPlaybackErrorCode,
  startMediaPlayback,
  waitForPlaybackProgress
} from "./mediaPlaybackVerification";

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

describe("startMediaPlayback", () => {
  it("keeps audible playback when the browser accepts it", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const media = { muted: false, play };

    await expect(startMediaPlayback(media, { allowMutedFallback: true })).resolves.toEqual({
      started: true,
      muted: false,
      usedMutedFallback: false
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("retries muted only for an autoplay-policy rejection", async () => {
    const play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    const media = { muted: false, play };

    await expect(startMediaPlayback(media, { allowMutedFallback: true })).resolves.toEqual({
      started: true,
      muted: true,
      usedMutedFallback: true
    });
    expect(media.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("does not hide network or decode failures behind a muted retry", async () => {
    const error = new DOMException("unsupported", "NotSupportedError");
    const play = vi.fn().mockRejectedValue(error);
    const media = { muted: false, play };

    await expect(startMediaPlayback(media, { allowMutedFallback: true })).resolves.toEqual({
      started: false,
      muted: false,
      usedMutedFallback: false,
      error
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("restores the audible state if the muted retry also fails", async () => {
    const initialError = new DOMException("blocked", "NotAllowedError");
    const fallbackError = new Error("decoder failed");
    const play = vi.fn().mockRejectedValueOnce(initialError).mockRejectedValueOnce(fallbackError);
    const media = { muted: false, play };

    await expect(startMediaPlayback(media, { allowMutedFallback: true })).resolves.toEqual({
      started: false,
      muted: false,
      usedMutedFallback: true,
      error: fallbackError,
      initialError
    });
    expect(media.muted).toBe(false);
  });
});
