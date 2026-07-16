import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTvAssistantChannelCatalog, rememberTvAssistantChannelCatalog } from "./tvChannelCatalog";

function createLocalStorageMock() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
}

describe("tv assistant channel catalog", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: createLocalStorageMock()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists the latest parsed channel urls for local execution lookup", () => {
    rememberTvAssistantChannelCatalog(
      [
        { id: "bbc", name: "BBC News", url: "https://example.com/bbc.m3u8" },
        { id: "fr24", name: "France 24", url: "https://example.com/fr24.m3u8" }
      ],
      "France 24"
    );

    expect(readTvAssistantChannelCatalog()).toMatchObject({
      channelNames: ["BBC News", "France 24"],
      channels: [
        { id: "bbc", name: "BBC News", url: "https://example.com/bbc.m3u8" },
        { id: "fr24", name: "France 24", url: "https://example.com/fr24.m3u8" }
      ],
      channelCount: 2,
      selectedChannelName: "France 24"
    });
  });
});
