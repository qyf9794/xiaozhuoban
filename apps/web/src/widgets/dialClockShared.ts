export const DIAL_CLOCK_MARK_COUNT = 60;
export const DIAL_CLOCK_SWEEP_PHRASE_PAUSE_MS = 1000;
export const DIAL_CLOCK_SWEEP_TOTAL_DURATION_MS = 10_000;
export const DIAL_CLOCK_SWEEP_CATCHUP_WINDOW_MS = 5_000;

export interface DialClockTimeState {
  hourNumber: number;
  minuteIndex: number;
  secondIndex: number;
  isAm: boolean;
  isOnHour: boolean;
}

export interface DialClockMarkState {
  index: number;
  minuteActive: boolean;
  secondTrailLevel: 0 | 1 | 2 | null;
  sweepTrailLevel: number | null;
  isMajor: boolean;
}

export interface DialClockSweepFrame {
  headIndex: number;
  trail: number[];
  phraseIndex: number;
  isPhraseEnd: boolean;
  frameDurationMs: number;
}

const DIAL_CLOCK_SWEEP_SEGMENTS = [
  { start: 0, end: 43, direction: 1 },
  { start: 43, end: 17, direction: -1 },
  { start: 17, end: 43, direction: 1 },
  { start: 43, end: 17, direction: -1 }
] as const;

function normalizeIndex(index: number) {
  return ((index % DIAL_CLOCK_MARK_COUNT) + DIAL_CLOCK_MARK_COUNT) % DIAL_CLOCK_MARK_COUNT;
}

export function toDialClockTimeState(date: Date): DialClockTimeState {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  return {
    hourNumber: hours % 12 || 12,
    minuteIndex: minutes,
    secondIndex: seconds,
    isAm: hours < 12,
    isOnHour: minutes === 0 && seconds === 0
  };
}

export function shouldTriggerDialClockSweep(date: Date) {
  const state = toDialClockTimeState(date);
  return state.isOnHour;
}

export function getDialClockSweepTriggerKey(
  previousDate: Date | null,
  currentDate: Date,
  catchupWindowMs = DIAL_CLOCK_SWEEP_CATCHUP_WINDOW_MS
) {
  const hourKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}-${currentDate.getHours()}`;
  if (shouldTriggerDialClockSweep(currentDate)) {
    return hourKey;
  }

  if (!previousDate) {
    return null;
  }

  const hourBoundary = new Date(currentDate);
  hourBoundary.setMinutes(0, 0, 0);
  const hourBoundaryTime = hourBoundary.getTime();
  if (
    previousDate.getTime() < hourBoundaryTime &&
    currentDate.getTime() >= hourBoundaryTime &&
    currentDate.getTime() - hourBoundaryTime <= catchupWindowMs
  ) {
    return hourKey;
  }

  return null;
}

function buildSweepPath(start: number, end: number, direction: 1 | -1) {
  const path: number[] = [];
  let current = normalizeIndex(start);
  path.push(current);
  while (current !== normalizeIndex(end)) {
    current = normalizeIndex(current + direction);
    path.push(current);
  }
  return path;
}

function getSweepTrailIndices(
  headIndex: number,
  trailLength: number,
  direction: 1 | -1,
  stepIndex: number,
  total: number
) {
  if (trailLength <= 0) {
    return [];
  }

  // Keep endpoint handoff frames on the same inner side so the tail does not flash to 44/16.
  if ((stepIndex === 0 || stepIndex === total - 1) && (headIndex === 43 || headIndex === 17)) {
    const fallbackDirection = headIndex === 43 ? -1 : 1;
    return Array.from({ length: trailLength }, (_, trailIndex) => normalizeIndex(headIndex + fallbackDirection * trailIndex));
  }

  return Array.from({ length: trailLength }, (_, trailIndex) => normalizeIndex(headIndex - direction * trailIndex));
}

function getPendulumFrameDurationMs(path: readonly number[], stepIndex: number) {
  if (path.length <= 1) return 43;

  const anchorIndex = Math.max(0, path.indexOf(30));
  const baseDuration = 43;
  const maxDuration = Math.round(baseDuration * 1.9);
  const minDuration = Math.max(12, Math.round(baseDuration * 0.22));

  if (stepIndex <= anchorIndex) {
    const progress = anchorIndex === 0 ? 1 : stepIndex / anchorIndex;
    const eased = progress * progress * progress;
    return Math.round(maxDuration - (maxDuration - minDuration) * eased);
  }

  const tailLength = path.length - 1 - anchorIndex;
  const progress = tailLength <= 0 ? 1 : (stepIndex - anchorIndex) / tailLength;
  const eased = 1 - (1 - progress) * (1 - progress) * (1 - progress);
  return Math.round(minDuration + (maxDuration - minDuration) * eased);
}

export function getDialClockSweepFrames(totalDurationMs = DIAL_CLOCK_SWEEP_TOTAL_DURATION_MS) {
  const phraseBlueprints = DIAL_CLOCK_SWEEP_SEGMENTS.map((segment, phraseIndex) => {
    const path = buildSweepPath(segment.start, segment.end, segment.direction);
    const total = path.length;
    const baseDurations = path.map((_, stepIndex) => getPendulumFrameDurationMs(path, stepIndex));
    const durationSum = baseDurations.reduce((sum, duration) => sum + duration, 0);

    return {
      segment,
      phraseIndex,
      path,
      total,
      baseDurations,
      durationSum
    };
  });

  const totalPauseDuration = DIAL_CLOCK_SWEEP_PHRASE_PAUSE_MS * (DIAL_CLOCK_SWEEP_SEGMENTS.length - 1);
  const targetPhraseDuration = Math.round(
    (totalDurationMs - totalPauseDuration) / DIAL_CLOCK_SWEEP_SEGMENTS.length
  );

  return phraseBlueprints.flatMap(({ segment, phraseIndex, path, total, baseDurations, durationSum }) => {
    const scale = durationSum === 0 ? 1 : targetPhraseDuration / durationSum;
    const scaledDurations = baseDurations.map((duration) => Math.max(8, Math.round(duration * scale)));
    const scaledSum = scaledDurations.reduce((sum, duration) => sum + duration, 0);
    const adjustment = targetPhraseDuration - scaledSum;
    if (scaledDurations.length > 0 && adjustment !== 0) {
      const lastIndex = scaledDurations.length - 1;
      scaledDurations[lastIndex] = Math.max(8, scaledDurations[lastIndex] + adjustment);
    }

    return path.map((headIndex, stepIndex): DialClockSweepFrame => {
      const trailLength = Math.min(12, Math.max(2, stepIndex + 1), Math.max(2, total - stepIndex));
      return {
        headIndex,
        trail: getSweepTrailIndices(headIndex, trailLength, segment.direction, stepIndex, total),
        phraseIndex,
        isPhraseEnd: stepIndex === total - 1,
        frameDurationMs: scaledDurations[stepIndex] ?? 8
      };
    });
  });
}

export function getDialClockSweepPhraseDurations(totalDurationMs = DIAL_CLOCK_SWEEP_TOTAL_DURATION_MS) {
  const frames = getDialClockSweepFrames(totalDurationMs);
  return DIAL_CLOCK_SWEEP_SEGMENTS.map((_segment, phraseIndex) =>
    frames.filter((frame) => frame.phraseIndex === phraseIndex).reduce((sum, frame) => sum + frame.frameDurationMs, 0)
  );
}

export function buildDialClockMarkStates(
  state: DialClockTimeState,
  sweepFrame: DialClockSweepFrame | null = null
): DialClockMarkState[] {
  const secondTrail = new Map<number, 0 | 1 | 2>([
    [state.secondIndex, 0],
    [normalizeIndex(state.secondIndex - 1), 1],
    [normalizeIndex(state.secondIndex - 2), 2]
  ]);
  const sweepTrail = new Map<number, number>();
  if (sweepFrame) {
    sweepFrame.trail.forEach((index, level) => {
      if (!sweepTrail.has(index)) {
        sweepTrail.set(index, level);
      }
    });
  }

  return Array.from({ length: DIAL_CLOCK_MARK_COUNT }, (_, index) => ({
    index,
    minuteActive: index === state.minuteIndex,
    secondTrailLevel: secondTrail.get(index) ?? null,
    sweepTrailLevel: sweepTrail.get(index) ?? null,
    isMajor: index % 5 === 0
  }));
}
