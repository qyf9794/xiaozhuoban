import { describe, expect, it, vi } from "vitest";
import { createBrowserSpeechWakeWordEngine, detectLocalWakeWord, type SpeechRecognitionConstructor } from "./localWakeWord";

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: { results: { length: number; item: (index: number) => { length: number; item: (index: number) => { transcript: string } } } }) => void) | null = null;
  onerror: ((event?: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  emitTranscript(transcript: string) {
    this.onresult?.({
      results: {
        length: 1,
        item: () => ({
          length: 1,
          item: () => ({ transcript })
        })
      }
    });
  }

  emitError(error: string) {
    this.onerror?.({ error });
  }

  emitEnd() {
    this.onend?.();
  }
}

describe("local wake word", () => {
  it("detects 小桌板 and extracts the trailing command", () => {
    expect(detectLocalWakeWord("小桌板，打开电视")).toEqual({
      wakeWord: "小桌板",
      transcript: "小桌板，打开电视",
      command: "打开电视"
    });
    expect(detectLocalWakeWord("你好小桌伴，请播放王菲的红豆")).toMatchObject({
      wakeWord: "小桌伴",
      command: "播放王菲的红豆"
    });
    expect(detectLocalWakeWord("打开电视")).toBeNull();
  });

  it("stops browser speech recognition before handing off to realtime wake handling", () => {
    FakeSpeechRecognition.instances = [];
    const statuses: string[] = [];
    const onWake = vi.fn();
    const engine = createBrowserSpeechWakeWordEngine({
      recognitionCtor: FakeSpeechRecognition as unknown as SpeechRecognitionConstructor,
      onWake,
      onStatusChange: (status) => statuses.push(status)
    });

    engine.start();
    FakeSpeechRecognition.instances[0]?.emitTranscript("小桌板 打开电视");

    expect(statuses).toEqual(["listening", "detected"]);
    expect(FakeSpeechRecognition.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(onWake).toHaveBeenCalledWith(expect.objectContaining({ command: "打开电视" }));
  });

  it("does not restart after terminal browser speech recognition errors", () => {
    FakeSpeechRecognition.instances = [];
    const statuses: string[] = [];
    const engine = createBrowserSpeechWakeWordEngine({
      recognitionCtor: FakeSpeechRecognition as unknown as SpeechRecognitionConstructor,
      onWake: vi.fn(),
      onStatusChange: (status) => statuses.push(status)
    });

    engine.start();
    FakeSpeechRecognition.instances[0]?.emitError("not-allowed");
    FakeSpeechRecognition.instances[0]?.emitEnd();

    expect(FakeSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
    expect(FakeSpeechRecognition.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["listening", "error"]);
  });

  it("backs off recognition restarts and stops after repeated unexpected endings", () => {
    vi.useFakeTimers();
    FakeSpeechRecognition.instances = [];
    const statuses: string[] = [];
    const engine = createBrowserSpeechWakeWordEngine({
      recognitionCtor: FakeSpeechRecognition as unknown as SpeechRecognitionConstructor,
      onWake: vi.fn(),
      onStatusChange: (status) => statuses.push(status),
      restartDelayMs: 50,
      maxRestarts: 1
    });

    engine.start();
    FakeSpeechRecognition.instances[0]?.emitEnd();
    expect(FakeSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(FakeSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(2);

    FakeSpeechRecognition.instances[0]?.emitEnd();
    vi.advanceTimersByTime(50);

    expect(FakeSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(["listening", "error"]);
    vi.useRealTimers();
  });

  it("treats browser aborted events as retryable interruptions", () => {
    vi.useFakeTimers();
    FakeSpeechRecognition.instances = [];
    const statuses: string[] = [];
    const engine = createBrowserSpeechWakeWordEngine({
      recognitionCtor: FakeSpeechRecognition as unknown as SpeechRecognitionConstructor,
      onWake: vi.fn(),
      onStatusChange: (status) => statuses.push(status),
      restartDelayMs: 50,
      maxRestarts: 2
    });

    engine.start();
    FakeSpeechRecognition.instances[0]?.emitError("aborted");
    FakeSpeechRecognition.instances[0]?.emitEnd();
    vi.advanceTimersByTime(50);

    expect(FakeSpeechRecognition.instances[0]?.stop).not.toHaveBeenCalled();
    expect(FakeSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(["listening", "error", "listening"]);
    vi.useRealTimers();
  });

  it("resets restart attempts after a stable recognition run", () => {
    vi.useFakeTimers();
    FakeSpeechRecognition.instances = [];
    const engine = createBrowserSpeechWakeWordEngine({
      recognitionCtor: FakeSpeechRecognition as unknown as SpeechRecognitionConstructor,
      onWake: vi.fn(),
      restartDelayMs: 50,
      maxRestarts: 1,
      stableRestartWindowMs: 100
    });

    engine.start();
    vi.advanceTimersByTime(100);
    FakeSpeechRecognition.instances[0]?.emitEnd();
    vi.advanceTimersByTime(50);
    expect(FakeSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(100);
    FakeSpeechRecognition.instances[0]?.emitEnd();
    vi.advanceTimersByTime(50);

    expect(FakeSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("treats repeated start calls as idempotent while recognition is already running", () => {
    FakeSpeechRecognition.instances = [];
    const engine = createBrowserSpeechWakeWordEngine({
      recognitionCtor: FakeSpeechRecognition as unknown as SpeechRecognitionConstructor,
      onWake: vi.fn()
    });

    engine.start();
    engine.start();

    expect(FakeSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
  });
});
