import { describe, expect, it } from "vitest";
import { estimateOpenAIUsageCost, estimateRealtimeResponseCost } from "./openaiCost";

describe("OpenAI usage cost estimates", () => {
  it("estimates gpt-realtime-2.1-mini multimodal token costs", () => {
    const estimate = estimateOpenAIUsageCost(
      "gpt-realtime-2.1-mini",
      {
        input_tokens: 1300,
        output_tokens: 80,
        input_token_details: {
          text_tokens: 1000,
          audio_tokens: 300,
          cached_tokens: 100,
          cached_tokens_details: { text_tokens: 100 }
        },
        output_token_details: {
          text_tokens: 50,
          audio_tokens: 30
        }
      },
      { source: "realtime", stage: "response.done" }
    );

    expect(estimate).toMatchObject({
      model: "gpt-realtime-2.1-mini",
      estimateAvailable: true,
      textInputTokens: 1000,
      cachedTextInputTokens: 100,
      audioInputTokens: 300,
      textOutputTokens: 50,
      audioOutputTokens: 30
    });
    expect(estimate?.estimatedCostUsd).toBe(0.004266);
  });

  it("keeps high-accuracy gpt-realtime-2.1 costs separate from mini mode", () => {
    const estimate = estimateOpenAIUsageCost(
      "gpt-realtime-2.1",
      {
        input_tokens: 1300,
        output_tokens: 80,
        input_token_details: {
          text_tokens: 1000,
          audio_tokens: 300,
          cached_tokens: 100,
          cached_tokens_details: { text_tokens: 100 }
        },
        output_token_details: {
          text_tokens: 50,
          audio_tokens: 30
        }
      },
      { source: "realtime", stage: "response.done" }
    );

    expect(estimate?.estimatedCostUsd).toBe(0.01636);
  });

  it("keeps usage when the current official pricing table does not include the model", () => {
    const estimate = estimateOpenAIUsageCost(
      "gpt-4.1-mini",
      { input_tokens: 200, output_tokens: 30 },
      { source: "responses", stage: "text_tool.select" }
    );

    expect(estimate).toMatchObject({
      model: "gpt-4.1-mini",
      estimateAvailable: false,
      inputTokens: 200,
      outputTokens: 30,
      unavailableReason: "model_pricing_not_in_current_official_table"
    });
    expect(estimate?.estimatedCostUsd).toBeUndefined();
  });

  it("extracts usage from realtime response.done events", () => {
    const estimate = estimateRealtimeResponseCost("gpt-realtime-2.1-mini", {
      type: "response.done",
      response: {
        id: "resp_123",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          input_token_details: { text_tokens: 10 },
          output_token_details: { text_tokens: 5 }
        }
      }
    });

    expect(estimate?.estimatedCostUsd).toBe(0.000018);
    expect(estimate?.responseId).toBe("resp_123");
  });
});
