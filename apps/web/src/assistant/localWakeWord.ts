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

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export interface BrowserSpeechWakeWordEngineOptions {
  recognitionCtor?: SpeechRecognitionConstructor | null;
  onWake: (detection: LocalWakeWordDetection) => void;
  onStatusChange?: (status: LocalWakeWordStatus) => void;
  wakeWords?: string[];
  lang?: string;
}

const DEFAULT_WAKE_WORDS = ["小桌板", "小桌伴", "小卓板", "小卓伴"];
const WAKE_WORD_COMMAND_PREFIX = /^(，|,|。|\.|！|!|？|\?|:|：|-|—|请|帮我|给我|你|可以|能不能)+/;

function normalizeWakeText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
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

  const match = wakeWords
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

export function createBrowserSpeechWakeWordEngine(options: BrowserSpeechWakeWordEngineOptions): LocalWakeWordEngine {
  const RecognitionCtor = options.recognitionCtor ?? getBrowserSpeechRecognitionConstructor();
  let recognition: SpeechRecognitionLike | null = null;
  let active = false;
  let stopRequested = false;

  const emitStatus = (status: LocalWakeWordStatus) => options.onStatusChange?.(status);

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
      try {
        next.stop();
      } catch {
        next.abort?.();
      }
      options.onWake(detection);
    };
    next.onerror = () => {
      if (!active) return;
      emitStatus("error");
    };
    next.onend = () => {
      if (!active || stopRequested) return;
      try {
        next.start();
        emitStatus("listening");
      } catch {
        emitStatus("error");
      }
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
      active = true;
      stopRequested = false;
      recognition = recognition ?? createRecognition();
      try {
        recognition?.start();
        emitStatus("listening");
      } catch {
        emitStatus("error");
      }
    },
    stop() {
      active = false;
      stopRequested = true;
      emitStatus(RecognitionCtor ? "idle" : "unsupported");
      try {
        recognition?.stop();
      } catch {
        recognition?.abort?.();
      }
    }
  };
}
