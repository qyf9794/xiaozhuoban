import { describe, expect, it, vi } from "vitest";
import { createBrowserSpeechWakeWordEngine, detectLocalWakeWord, type SpeechRecognitionConstructor } from "./localWakeWord";

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: { results: { length: number; item: (index: number) => { length: number; item: (index: number) => { transcript: string } } } }) => void) | null = null;
  onerror: (() => void) | null = null;
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
});
