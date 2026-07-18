export type PlaybackProgressVerification = {
  verified: boolean;
  startTime: number;
  endTime: number;
  advancedBy: number;
  elapsedMs: number;
};

type PlaybackProgressOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  minimumAdvanceSeconds?: number;
};

function finiteMediaTime(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * A resolved `HTMLMediaElement.play()` only means that playback was accepted.
 * Success is reported after the media clock actually moves, which catches
 * empty/corrupt responses and players that remain stalled after `play()`.
 */
export async function waitForPlaybackProgress(
  readCurrentTime: () => number,
  options: PlaybackProgressOptions = {}
): Promise<PlaybackProgressVerification> {
  const timeoutMs = Math.max(0, options.timeoutMs ?? 2_000);
  const pollIntervalMs = Math.max(10, options.pollIntervalMs ?? 50);
  const minimumAdvanceSeconds = Math.max(0.01, options.minimumAdvanceSeconds ?? 0.05);
  const startedAt = Date.now();
  const startTime = finiteMediaTime(readCurrentTime());
  let endTime = startTime;

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
    endTime = finiteMediaTime(readCurrentTime());
    if (endTime - startTime >= minimumAdvanceSeconds) {
      return {
        verified: true,
        startTime,
        endTime,
        advancedBy: endTime - startTime,
        elapsedMs: Date.now() - startedAt
      };
    }
  }

  return {
    verified: false,
    startTime,
    endTime,
    advancedBy: Math.max(0, endTime - startTime),
    elapsedMs: Date.now() - startedAt
  };
}

export function mediaPlaybackErrorCode(error: unknown): "BROWSER_PLAYBACK_BLOCKED" | "MUSIC_PLAY_FAILED" {
  return error instanceof DOMException && error.name === "NotAllowedError"
    ? "BROWSER_PLAYBACK_BLOCKED"
    : "MUSIC_PLAY_FAILED";
}
