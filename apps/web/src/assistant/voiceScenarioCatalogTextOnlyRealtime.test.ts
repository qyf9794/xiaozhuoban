import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OpenAIRealtimeWebRtcAdapter } from "./openaiRealtimeAdapter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");
const catalogPath = path.join(repoRoot, "docs/realtime-voice-scenario-command-catalog-700.md");
const reportPath = path.join(repoRoot, "docs/realtime-voice-scenario-catalog-text-only-realtime-report.md");

function parseCatalog() {
  const text = fs.readFileSync(catalogPath, "utf8");
  return [...text.matchAll(/^(\d{3})\. (.+)$/gm)].map((match) => ({
    id: Number(match[1]),
    text: match[2]
  }));
}

describe("700 voice scenario catalog through text-only Realtime event flow", () => {
  it("sends every catalog command as input_text plus text-only response.create without microphone", () => {
    const cases = parseCatalog();
    const rows = [
      "# Realtime Voice Scenario Catalog Text-Only Realtime Report",
      "",
      "Every row below was sent through `OpenAIRealtimeWebRtcAdapter.sendTextCommand`, which emits `conversation.item.create` with `input_text` followed by `response.create` with `output_modalities: ['text']`.",
      ""
    ];
    const failures: string[] = [];

    for (const testCase of cases) {
      const sent: Array<{ type?: string; item?: { content?: Array<{ type?: string; text?: string }> }; response?: { output_modalities?: string[] } }> = [];
      const adapter = new OpenAIRealtimeWebRtcAdapter();
      Object.assign(adapter as unknown as { sessionReady: boolean; dataChannel: { readyState: string; send: (payload: string) => void } }, {
        sessionReady: true,
        dataChannel: {
          readyState: "open",
          send(payload: string) {
            sent.push(JSON.parse(payload) as typeof sent[number]);
          }
        }
      });

      adapter.sendTextCommand(testCase.text, { commandTraceId: `text_only_${String(testCase.id).padStart(3, "0")}` });
      (adapter as unknown as { handleRealtimeEventData: (data: string) => void }).handleRealtimeEventData(
        JSON.stringify({ type: "session.updated" })
      );

      const inputTextIndex = sent.findIndex(
        (event) =>
          event.type === "conversation.item.create" &&
          event.item?.content?.[0]?.type === "input_text" &&
          event.item?.content?.[0]?.text === testCase.text
      );
      const responseIndex = sent.findIndex(
        (event, index) =>
          index > inputTextIndex &&
          event.type === "response.create" &&
          event.response?.output_modalities?.includes("text")
      );
      const ok = inputTextIndex >= 0 && responseIndex > inputTextIndex;
      rows.push(`${String(testCase.id).padStart(3, "0")}. [${ok ? "pass" : "fail"}] command=${testCase.text}`);
      if (!ok) {
        failures.push(`${String(testCase.id).padStart(3, "0")} ${testCase.text}: ${JSON.stringify(sent)}`);
      }
    }

    fs.writeFileSync(reportPath, `${rows.join("\n")}\n`, "utf8");

    expect(cases).toHaveLength(700);
    expect(failures).toEqual([]);
  });
});
