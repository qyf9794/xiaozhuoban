export type LocalWakeWordStatus = "unsupported" | "idle" | "listening" | "detected" | "error";

export interface LocalWakeWordDetection {
  wakeWord: string;
  transcript: string;
  command: string;
}

export interface LocalWakeWordEngine {
  start: () => void;
  stop: () => void;
  isSupported: () => boolean;
}

type SpeechRecognitionResultAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  length: number;
  item: (index: number) => SpeechRecognitionResultAlternativeLike;
  isFinal?: boolean;
};

type SpeechRecognitionResultListLike = {
  length: number;
  item: (index: number) => SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event?: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export interface BrowserSpeechWakeWordEngineOptions {
  recognitionCtor?: SpeechRecognitionConstructor | null;
  onWake: (detection: LocalWakeWordDetection) => void;
  onStatusChange?: (status: LocalWakeWordStatus, detail?: { error?: string }) => void;
  wakeWords?: string[];
  lang?: string;
  restartDelayMs?: number;
  maxRestarts?: number;
  stableRestartWindowMs?: number;
}

const DEFAULT_WAKE_WORDS = ["小桌板", "小桌版", "小桌伴", "小桌办", "小卓板", "小卓版", "小卓伴", "小卓办"];
const WAKE_WORD_COMMAND_PREFIX = /^(，|,|。|\.|！|!|？|\?|:|：|-|—|请|帮我|给我|你|可以|能不能|儿|啊|呀|呢|吧)+/;
const TERMINAL_SPEECH_RECOGNITION_ERRORS = new Set(["not-allowed", "service-not-allowed"]);
const DEFAULT_RESTART_DELAY_MS = 800;
const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_STABLE_RESTART_WINDOW_MS = 5000;
const LOCAL_WAKE_WORD_AUDIO_SILENCE_FLOOR = 0.01;
const LOCAL_WAKE_WORD_AUDIO_GAIN = 5.2;

function normalizeWakeText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[卓]/g, "桌")
    .replace(/[版伴辦办]/g, "板")
    .replace(/[“”"']/g, "")
    .replace(/[，,。.!！?？:：；;、-]/g, "");
}

function trimWakeCommandPrefix(value: string): string {
  let next = value.trim();
  while (WAKE_WORD_COMMAND_PREFIX.test(next)) {
    next = next.replace(WAKE_WORD_COMMAND_PREFIX, "").trim();
  }
  return next;
}

export function detectLocalWakeWord(transcript: string, wakeWords: string[] = DEFAULT_WAKE_WORDS): LocalWakeWordDetection | null {
  const rawTranscript = transcript.trim();
  if (!rawTranscript) return null;
  const compactTranscript = normalizeWakeText(rawTranscript);
  if (!compactTranscript) return null;

  const exactMatch = wakeWords
    .map((wakeWord) => ({ wakeWord, index: rawTranscript.indexOf(wakeWord) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)[0];
  const match = exactMatch ?? wakeWords
    .map((wakeWord) => ({ wakeWord, index: compactTranscript.indexOf(normalizeWakeText(wakeWord)) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)[0];
  if (!match) return null;

  const compactWakeWord = normalizeWakeText(match.wakeWord);
  const compactRemainder = compactTranscript.slice(match.index + compactWakeWord.length);
  const rawWakeIndex = rawTranscript.indexOf(match.wakeWord);
  const rawRemainder = rawWakeIndex >= 0 ? rawTranscript.slice(rawWakeIndex + match.wakeWord.length) : compactRemainder;

  return {
    wakeWord: match.wakeWord,
    transcript: rawTranscript,
    command: trimWakeCommandPrefix(rawRemainder || compactRemainder)
  };
}

function getBrowserSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const candidate = globalThis as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function extractTranscript(event: SpeechRecognitionEventLike): string {
  const parts: string[] = [];
  for (let resultIndex = 0; resultIndex < event.results.length; resultIndex += 1) {
    const result = event.results.item(resultIndex);
    for (let alternativeIndex = 0; alternativeIndex < result.length; alternativeIndex += 1) {
      const transcript = result.item(alternativeIndex).transcript.trim();
      if (transcript) parts.push(transcript);
    }
  }
  return parts.join(" ").trim();
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function resolveLocalWakeWordAudioLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sumSquares += centered * centered;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return clampUnit(Math.max(0, rms - LOCAL_WAKE_WORD_AUDIO_SILENCE_FLOOR) * LOCAL_WAKE_WORD_AUDIO_GAIN);
}

export function createBrowserSpeechWakeWordEngine(options: BrowserSpeechWakeWordEngineOptions): LocalWakeWordEngine {
  const RecognitionCtor = options.recognitionCtor ?? getBrowserSpeechRecognitionConstructor();
  let recognition: SpeechRecognitionLike | null = null;
  let active = false;
  let stopRequested = false;
  let recognitionRunning = false;
  let restartAttempts = 0;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStatus: LocalWakeWordStatus | null = null;
  let lastStartAt = 0;

  const restartDelayMs = options.restartDelayMs ?? DEFAULT_RESTART_DELAY_MS;
  const maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
  const stableRestartWindowMs = options.stableRestartWindowMs ?? DEFAULT_STABLE_RESTART_WINDOW_MS;

  const clearRestartTimer = () => {
    if (!restartTimer) return;
    clearTimeout(restartTimer);
    restartTimer = null;
  };

  const emitStatus = (status: LocalWakeWordStatus, detail?: { error?: string }) => {
    if (lastStatus === status) return;
    lastStatus = status;
    options.onStatusChange?.(status, detail);
  };

  const stopRecognition = (status: LocalWakeWordStatus) => {
    active = false;
    stopRequested = true;
    recognitionRunning = false;
    clearRestartTimer();
    emitStatus(status);
    try {
      recognition?.stop();
    } catch {
      recognition?.abort?.();
    }
  };

  const startRecognition = () => {
    if (!recognition || recognitionRunning || !active || stopRequested) return;
    try {
      recognition.start();
      recognitionRunning = true;
      lastStartAt = Date.now();
      emitStatus("listening");
    } catch (error) {
      const message = error instanceof Error ? error.message : "recognition_start_failed";
      active = false;
      stopRequested = true;
      recognitionRunning = false;
      clearRestartTimer();
      emitStatus("error", { error: message });
    }
  };

  const createRecognition = () => {
    if (!RecognitionCtor) return null;
    const next = new RecognitionCtor();
    next.lang = options.lang ?? "zh-CN";
    next.continuous = true;
    next.interimResults = true;
    next.maxAlternatives = 1;
    next.onresult = (event) => {
      const detection = detectLocalWakeWord(extractTranscript(event), options.wakeWords);
      if (!detection) return;
      emitStatus("detected");
      stopRequested = true;
      active = false;
      recognitionRunning = false;
      clearRestartTimer();
      try {
        next.stop();
      } catch {
        next.abort?.();
      }
      options.onWake(detection);
    };
    next.onerror = (event) => {
      if (!active) return;
      emitStatus("error", { error: event?.error });
      if (TERMINAL_SPEECH_RECOGNITION_ERRORS.has(event?.error ?? "")) {
        stopRecognition("error");
      }
    };
    next.onend = () => {
      recognitionRunning = false;
      if (!active || stopRequested) return;
      if (Date.now() - lastStartAt >= stableRestartWindowMs) {
        restartAttempts = 0;
      }
      if (restartAttempts >= maxRestarts) {
        active = false;
        stopRequested = true;
        emitStatus("error");
        return;
      }
      restartAttempts += 1;
      clearRestartTimer();
      restartTimer = setTimeout(() => {
        restartTimer = null;
        startRecognition();
      }, restartDelayMs);
    };
    return next;
  };

  return {
    isSupported: () => Boolean(RecognitionCtor),
    start() {
      if (!RecognitionCtor) {
        emitStatus("unsupported");
        return;
      }
      if (active && recognitionRunning) return;
      active = true;
      stopRequested = false;
      restartAttempts = 0;
      clearRestartTimer();
      recognition = recognition ?? createRecognition();
      startRecognition();
    },
    stop() {
      stopRecognition(RecognitionCtor ? "idle" : "unsupported");
    }
  };
}
