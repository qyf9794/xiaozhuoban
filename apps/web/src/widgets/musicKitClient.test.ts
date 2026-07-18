import { describe, expect, it } from "vitest";
import {
  configureMusicKit,
  createMusicKitQueueDescriptor,
  formatMusicArtworkUrl,
  inferAppleMusicStorefront,
  isMusicKitAuthorized,
  readMusicKitPlaybackTime,
  normalizeITunesTracks,
  normalizeMusicKitSearchResults,
  searchAppleMusicCatalogApi,
  searchAppleMusicCatalog
} from "./musicKitClient";

describe("musicKitClient", () => {
  it("normalizes MusicKit song, album, and playlist search results", () => {
    const results = normalizeMusicKitSearchResults({
      songs: {
        data: [
          {
            id: "song_1",
            type: "songs",
            attributes: {
              name: "Song One",
              artistName: "Artist",
              artwork: { url: "https://img/{w}x{h}.jpg" }
            }
          }
        ]
      },
      albums: {
        data: [{ id: "album_1", type: "albums", attributes: { name: "Album One", artistName: "Artist" } }]
      },
      playlists: {
        data: [{ id: "playlist_1", type: "playlists", attributes: { name: "Playlist One", curatorName: "Editor" } }]
      }
    });

    expect(results).toEqual([
      {
        id: "song_1",
        source: "apple",
        kind: "song",
        title: "Song One",
        subtitle: "Artist",
        artworkUrl: "https://img/240x240.jpg",
        url: undefined
      },
      {
        id: "album_1",
        source: "apple",
        kind: "album",
        title: "Album One",
        subtitle: "Artist",
        artworkUrl: undefined,
        url: undefined
      },
      {
        id: "playlist_1",
        source: "apple",
        kind: "playlist",
        title: "Playlist One",
        subtitle: "Editor",
        artworkUrl: undefined,
        url: undefined
      }
    ]);
  });

  it("normalizes wrapped Apple Music catalog search results", () => {
    expect(
      normalizeMusicKitSearchResults({
        results: {
          songs: {
            data: [
              {
                id: "song_2",
                type: "songs",
                attributes: {
                  name: "Wrapped Song",
                  artistName: "Artist"
                }
              }
            ]
          }
        }
      })
    ).toEqual([
      {
        id: "song_2",
        source: "apple",
        kind: "song",
        title: "Wrapped Song",
        subtitle: "Artist",
        artworkUrl: undefined,
        url: undefined
      }
    ]);
  });


  it("creates MusicKit queue descriptors by result kind", () => {
    expect(createMusicKitQueueDescriptor({ id: "s1", source: "apple", kind: "song", title: "Song", subtitle: "Artist" })).toEqual({
      song: "s1"
    });
    expect(createMusicKitQueueDescriptor({ id: "a1", source: "apple", kind: "album", title: "Album", subtitle: "Artist" })).toEqual({
      album: "a1"
    });
    expect(
      createMusicKitQueueDescriptor({ id: "p1", source: "apple", kind: "playlist", title: "Playlist", subtitle: "Editor" })
    ).toEqual({ playlist: "p1" });
  });

  it("normalizes iTunes preview results for fallback playback", () => {
    expect(
      normalizeITunesTracks([
        {
          trackId: 1,
          trackName: "Preview",
          artistName: "Artist",
          artworkUrl100: "https://img/100x100bb.jpg",
          previewUrl: "https://audio/preview.m4a"
        }
      ])
    ).toEqual([
      {
        id: "1",
        source: "itunes",
        kind: "song",
        title: "Preview",
        subtitle: "Artist",
        artworkUrl: "https://img/240x240bb.jpg",
        previewUrl: "https://audio/preview.m4a"
      }
    ]);
  });

  it("formats MusicKit artwork template URLs", () => {
    expect(formatMusicArtworkUrl("https://img/{w}/{h}.jpg", 320)).toBe("https://img/320/320.jpg");
  });

  it("uses the configured MusicKit instance when getInstance is not ready", async () => {
    const instance = {
      authorize: async () => "user-token",
      setQueue: async () => undefined,
      play: async () => undefined,
      pause: () => undefined,
      isAuthorized: true
    };
    const fakeWindow = {
      MusicKit: {
        configure: () => instance,
        getInstance: () => undefined
      }
    } as unknown as Window;

    await expect(configureMusicKit("developer-token", fakeWindow)).resolves.toBe(instance);
  });

  it("reports a clear error when MusicKit does not return an instance", async () => {
    const fakeWindow = {
      MusicKit: {
        configure: () => undefined,
        getInstance: () => undefined
      }
    } as unknown as Window;

    await expect(configureMusicKit("developer-token", fakeWindow)).rejects.toThrow("MusicKit SDK 未返回播放器实例");
  });

  it("reads MusicKit authorization status defensively", () => {
    expect(isMusicKitAuthorized(undefined)).toBe(false);
    expect(isMusicKitAuthorized({ isAuthorized: false } as never)).toBe(false);
    expect(isMusicKitAuthorized({ isAuthorized: true } as never)).toBe(true);
  });

  it("reads the MusicKit playback clock across SDK variants", () => {
    expect(readMusicKitPlaybackTime({ currentPlaybackTime: 3.25 } as never)).toBe(3.25);
    expect(readMusicKitPlaybackTime({ currentPlaybackDuration: 200, currentPlaybackProgress: 0.25 } as never)).toBe(50);
    expect(readMusicKitPlaybackTime({ currentPlaybackDuration: 200, currentPlaybackProgress: 25 } as never)).toBe(50);
    expect(readMusicKitPlaybackTime({ currentPlaybackTime: Number.NaN } as never)).toBe(0);
    expect(readMusicKitPlaybackTime(undefined)).toBe(0);
  });

  it("searches through the legacy MusicKit search method when available", async () => {
    const calls: unknown[] = [];
    const payload = { songs: { data: [] } };
    const music = {
      authorize: async () => "user-token",
      setQueue: async () => undefined,
      play: async () => undefined,
      pause: () => undefined,
      api: {
        search: async (term: string, options: { types: string; limit: number }) => {
          calls.push({ term, options });
          return payload;
        }
      }
    };

    await expect(searchAppleMusicCatalog(music, " 周杰伦 ", { types: "songs,albums,playlists", limit: 18 })).resolves.toBe(payload);
    expect(calls).toEqual([{ term: "周杰伦", options: { types: "songs,albums,playlists", limit: 18 } }]);
  });

  it("searches through the MusicKit v3 passthrough API when search is absent", async () => {
    const calls: unknown[] = [];
    const payload = { songs: { data: [] } };
    const music = {
      authorize: async () => "user-token",
      setQueue: async () => undefined,
      play: async () => undefined,
      pause: () => undefined,
      api: {
        music: async (path: string, params?: Record<string, string | number>) => {
          calls.push({ path, params });
          return payload;
        }
      }
    };

    await expect(searchAppleMusicCatalog(music, "周杰伦", { types: "songs,albums,playlists", limit: 18 })).resolves.toBe(payload);
    expect(calls).toEqual([
      {
        path: "/v1/catalog/{{storefrontId}}/search",
        params: { term: "周杰伦", types: "songs,albums,playlists", limit: 18 }
      }
    ]);
  });

  it("infers storefront from the browser locale", () => {
    expect(inferAppleMusicStorefront("zh-CN")).toBe("cn");
    expect(inferAppleMusicStorefront("en-US")).toBe("us");
    expect(inferAppleMusicStorefront("zh")).toBe("us");
  });

  it("searches Apple Music catalog directly with the developer token", async () => {
    const calls: unknown[] = [];
    const payload = { results: { songs: { data: [] } } };
    const fakeFetch = async (input: string | URL, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(input), headers: init?.headers });
      return {
        ok: true,
        status: 200,
        json: async () => payload
      };
    };

    await expect(searchAppleMusicCatalogApi("dev-token", "周杰伦", { types: "songs,albums,playlists", limit: 18 }, "cn", fakeFetch)).resolves.toBe(
      payload
    );
    expect(calls).toEqual([
      {
        url: "https://api.music.apple.com/v1/catalog/cn/search?term=%E5%91%A8%E6%9D%B0%E4%BC%A6&types=songs%2Calbums%2Cplaylists&limit=18",
        headers: { Authorization: "Bearer dev-token" }
      }
    ]);
  });
});
