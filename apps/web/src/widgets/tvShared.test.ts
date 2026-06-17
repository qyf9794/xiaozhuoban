import { describe, expect, it } from "vitest";
import { clampTvWidgetSize, findFallbackTvChannel, findTvChannel, parseM3UPlaylist } from "./tvShared";

describe("parseM3UPlaylist", () => {
  it("parses EXTINF entries with urls", () => {
    const content = `#EXTM3U\n#EXTINF:-1,央视一套\nhttp://example.com/cctv1.m3u8\n#EXTINF:-1,凤凰中文\nhttp://example.com/phoenix.m3u8`;
    const channels = parseM3UPlaylist(content);

    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({
      name: "央视一套",
      url: "http://example.com/cctv1.m3u8"
    });
    expect(channels[1]).toMatchObject({
      name: "凤凰中文",
      url: "http://example.com/phoenix.m3u8"
    });
  });

  it("falls back to generated names when EXTINF is missing", () => {
    const content = `#EXTM3U\nhttp://example.com/live1.m3u8\nhttp://example.com/live2.m3u8`;
    const channels = parseM3UPlaylist(content);

    expect(channels).toHaveLength(2);
    expect(channels[0].name).toBe("频道 1");
    expect(channels[1].name).toBe("频道 2");
  });

  it("ignores comments and empty lines", () => {
    const content = `#EXTM3U\n\n# this is a comment\n#EXTINF:-1,Discovery\n\nhttp://example.com/discovery.m3u8\n`;
    const channels = parseM3UPlaylist(content);

    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("Discovery");
  });
});

describe("findTvChannel", () => {
  it("matches CCTV channel names despite punctuation and suffix differences", () => {
    const channels = [
      { id: "1", name: "CCTV-13 新闻", url: "https://example.com/cctv13.m3u8" },
      { id: "2", name: "BBC News", url: "https://example.com/bbc.m3u8" }
    ];

    expect(findTvChannel(channels, "CCTV13")?.id).toBe("1");
    expect(findTvChannel(channels, "CCTV-13 新闻")?.id).toBe("1");
    expect(findTvChannel(channels, "BBC")?.id).toBe("2");
  });

  it("falls back to the built-in CCTV news channel for common aliases", () => {
    expect(findFallbackTvChannel("CCTV13")?.name).toBe("CCTV-13 新闻");
    expect(findFallbackTvChannel("央视新闻")?.name).toBe("CCTV-13 新闻");
    expect(findFallbackTvChannel("中央新闻")?.name).toBe("CCTV-13 新闻");
  });
});

describe("clampTvWidgetSize", () => {
  it("clamps width and keeps fixed tv height", () => {
    expect(clampTvWidgetSize(999, 10)).toEqual({ w: 498, h: 480 });
    expect(clampTvWidgetSize(180, 1400)).toEqual({ w: 240, h: 480 });
  });
});
