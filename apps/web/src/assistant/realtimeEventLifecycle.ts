export type RealtimeEvent = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function normalizeRealtimeTransportEvent(data: unknown): RealtimeEvent | null {
  if (isRecord(data)) return data;
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function extractRealtimeResponseId(event: RealtimeEvent): string {
  const response = isRecord(event.response) ? event.response : null;
  return typeof response?.id === "string" ? response.id : typeof event.response_id === "string" ? event.response_id : "";
}

export function shouldLogRealtimeEventType(type: string): boolean {
  if (!type || type.endsWith(".delta")) return false;
  return (
    type === "error" ||
    type.startsWith("input_audio_buffer.") ||
    type.startsWith("session.") ||
    type.startsWith("response.") ||
    type.startsWith("conversation.") ||
    type.includes("transcription") ||
    type.includes("function_call")
  );
}

export function reduceRealtimeActiveResponseId(activeResponseId: string | null, event: RealtimeEvent): string | null {
  if (event.type === "response.created") {
    return extractRealtimeResponseId(event) || activeResponseId;
  }
  if (event.type === "response.done" || event.type === "response.cancelled" || event.type === "response.failed") {
    const responseId = extractRealtimeResponseId(event);
    return !responseId || responseId === activeResponseId ? null : activeResponseId;
  }
  return activeResponseId;
}
