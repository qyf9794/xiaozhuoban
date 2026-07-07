export type OpenAIUsageCostEstimate = {
  model: string;
  responseId?: string;
  stage?: string;
  source: "realtime" | "responses";
  pricingSource: string;
  pricingCheckedAt: string;
  currency: "USD";
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  textInputTokens?: number;
  cachedTextInputTokens?: number;
  textOutputTokens?: number;
  audioInputTokens?: number;
  cachedAudioInputTokens?: number;
  audioOutputTokens?: number;
  estimatedCostUsd?: number;
  estimateAvailable: boolean;
  unavailableReason?: string;
};

const PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing";
const PRICING_CHECKED_AT = "2026-07-05";
const MILLION = 1_000_000;

type TokenRates = {
  input?: number;
  cachedInput?: number;
  output?: number;
  textInput?: number;
  cachedTextInput?: number;
  textOutput?: number;
  audioInput?: number;
  cachedAudioInput?: number;
  audioOutput?: number;
};

const MODEL_TOKEN_RATES: Record<string, TokenRates> = {
  "gpt-realtime-2": {
    textInput: 4,
    cachedTextInput: 0.4,
    textOutput: 24,
    audioInput: 32,
    cachedAudioInput: 0.4,
    audioOutput: 64
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function tokenCost(tokens: number | undefined, ratePerMillion: number | undefined): number {
  if (!tokens || !ratePerMillion) return 0;
  return (tokens / MILLION) * ratePerMillion;
}

function readDetails(usage: Record<string, unknown>) {
  const inputDetails = isRecord(usage.input_token_details) ? usage.input_token_details : {};
  const outputDetails = isRecord(usage.output_token_details) ? usage.output_token_details : {};
  const cachedDetails = isRecord(inputDetails.cached_tokens_details) ? inputDetails.cached_tokens_details : {};
  return { inputDetails, outputDetails, cachedDetails };
}

export function estimateOpenAIUsageCost(
  model: string,
  usage: unknown,
  options: { source: "realtime" | "responses"; stage?: string; responseId?: string }
): OpenAIUsageCostEstimate | null {
  if (!isRecord(usage)) return null;
  const rates = MODEL_TOKEN_RATES[model];
  const { inputDetails, outputDetails, cachedDetails } = readDetails(usage);
  const inputTokens = readNumber(usage.input_tokens);
  const outputTokens = readNumber(usage.output_tokens);
  const cachedInputTokens = readNumber(inputDetails.cached_tokens);
  const textInputTokens = readNumber(inputDetails.text_tokens);
  const audioInputTokens = readNumber(inputDetails.audio_tokens);
  const cachedTextInputTokens = readNumber(cachedDetails.text_tokens);
  const cachedAudioInputTokens = readNumber(cachedDetails.audio_tokens);
  const textOutputTokens = readNumber(outputDetails.text_tokens);
  const audioOutputTokens = readNumber(outputDetails.audio_tokens);

  const estimate: OpenAIUsageCostEstimate = {
    model,
    responseId: options.responseId,
    stage: options.stage,
    source: options.source,
    pricingSource: PRICING_SOURCE,
    pricingCheckedAt: PRICING_CHECKED_AT,
    currency: "USD",
    inputTokens,
    cachedInputTokens,
    outputTokens,
    textInputTokens,
    cachedTextInputTokens,
    textOutputTokens,
    audioInputTokens,
    cachedAudioInputTokens,
    audioOutputTokens,
    estimateAvailable: Boolean(rates)
  };

  if (!rates) {
    estimate.unavailableReason = "model_pricing_not_in_current_official_table";
    return estimate;
  }

  if (textInputTokens !== undefined || audioInputTokens !== undefined || textOutputTokens !== undefined || audioOutputTokens !== undefined) {
    const billableTextInput = Math.max(0, (textInputTokens ?? 0) - (cachedTextInputTokens ?? 0));
    const billableAudioInput = Math.max(0, (audioInputTokens ?? 0) - (cachedAudioInputTokens ?? 0));
    estimate.estimatedCostUsd = roundUsd(
      tokenCost(billableTextInput, rates.textInput) +
        tokenCost(cachedTextInputTokens, rates.cachedTextInput) +
        tokenCost(billableAudioInput, rates.audioInput) +
        tokenCost(cachedAudioInputTokens, rates.cachedAudioInput) +
        tokenCost(textOutputTokens, rates.textOutput) +
        tokenCost(audioOutputTokens, rates.audioOutput)
    );
    return estimate;
  }

  const billableInput = Math.max(0, (inputTokens ?? 0) - (cachedInputTokens ?? 0));
  estimate.estimatedCostUsd = roundUsd(
    tokenCost(billableInput, rates.input) + tokenCost(cachedInputTokens, rates.cachedInput) + tokenCost(outputTokens, rates.output)
  );
  return estimate;
}

export function estimateRealtimeResponseCost(model: string, event: unknown): OpenAIUsageCostEstimate | null {
  if (!isRecord(event)) return null;
  const response = isRecord(event.response) ? event.response : undefined;
  const responseId = typeof response?.id === "string" ? response.id : typeof event.response_id === "string" ? event.response_id : undefined;
  return estimateOpenAIUsageCost(model, response?.usage, { source: "realtime", stage: "response.done", responseId });
}
