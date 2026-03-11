import { describe, expect, it } from "vitest";
import { normalizeMessageList, type MessageBoardItem } from "./collab";

describe("normalizeMessageList", () => {
  it("keeps the latest 50 messages in reverse chronological order while deduplicating", () => {
    const items: MessageBoardItem[] = [
      ...Array.from({ length: 55 }, (_, index) => ({
        id: `${index + 1}`,
        senderId: `u${index + 1}`,
        senderName: `U${index + 1}`,
        text: `m${index + 1}`,
        createdAt: `2026-03-11T00:00:${String(index).padStart(2, "0")}.000Z`
      })),
      { id: "55", senderId: "u55", senderName: "U55", text: "m55", createdAt: "2026-03-11T00:00:54.000Z" }
    ];

    const normalized = normalizeMessageList(items);

    expect(normalized).toHaveLength(50);
    expect(normalized[0]?.id).toBe("55");
    expect(normalized.at(-1)?.id).toBe("6");
  });
});
