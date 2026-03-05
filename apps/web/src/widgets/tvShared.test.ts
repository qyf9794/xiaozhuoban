import { describe, expect, it } from "vitest";
import { clampTvWidgetSize, parseM3UPlaylist } from "./tvShared";

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

describe("clampTvWidgetSize", () => {
  it("clamps width and keeps fixed tv height", () => {
    expect(clampTvWidgetSize(999, 10)).toEqual({ w: 498, h: 480 });
    expect(clampTvWidgetSize(180, 1400)).toEqual({ w: 240, h: 480 });
  });
});
