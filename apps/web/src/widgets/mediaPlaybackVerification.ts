export type PlaybackProgressVerification = {
  verified: boolean;
  startTime: number;
  endTime: number;
  advancedBy: number;
  elapsedMs: number;
};

export type MediaPlaybackStartResult =
  | {
      started: true;
      muted: boolean;
      usedMutedFallback: boolean;
    }
  | {
      started: false;
      muted: boolean;
      usedMutedFallback: boolean;
      error: unknown;
      initialError?: unknown;
    };

type PlayableMediaElement = Pick<HTMLMediaElement, "muted" | "play">;

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

export function isAutoplayPolicyError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "NotAllowedError") return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    name === "NotAllowedError" ||
    code === "NotAllowedError" ||
    /(?:autoplay|auto-play|user (?:gesture|activation)|not allowed).*?(?:play|audio|media)|(?:play|audio|media).*?(?:autoplay|auto-play|user (?:gesture|activation)|not allowed)/i.test(
      message
    )
  );
}

/**
 * Start media audibly when policy permits it. If the browser rejects only
 * because no user activation is available, retry muted so the visual media
 * can still begin and the UI can offer a direct click-to-unmute action.
 */
export async function startMediaPlayback(
  media: PlayableMediaElement,
  options: { allowMutedFallback?: boolean } = {}
): Promise<MediaPlaybackStartResult> {
  try {
    await media.play();
    return { started: true, muted: media.muted, usedMutedFallback: false };
  } catch (initialError) {
    if (!options.allowMutedFallback || media.muted || !isAutoplayPolicyError(initialError)) {
      return {
        started: false,
        muted: media.muted,
        usedMutedFallback: false,
        error: initialError
      };
    }

    const previousMuted = media.muted;
    media.muted = true;
    try {
      await media.play();
      return { started: true, muted: true, usedMutedFallback: true };
    } catch (fallbackError) {
      media.muted = previousMuted;
      return {
        started: false,
        muted: media.muted,
        usedMutedFallback: true,
        error: fallbackError,
        initialError
      };
    }
  }
}

export function mediaPlaybackErrorCode(error: unknown): "BROWSER_PLAYBACK_BLOCKED" | "MUSIC_PLAY_FAILED" {
  return isAutoplayPolicyError(error)
    ? "BROWSER_PLAYBACK_BLOCKED"
    : "MUSIC_PLAY_FAILED";
}
