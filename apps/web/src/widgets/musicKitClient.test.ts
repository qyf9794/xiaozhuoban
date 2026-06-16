import { describe, expect, it } from "vitest";
import {
  configureMusicKit,
  createMusicKitQueueDescriptor,
  formatMusicArtworkUrl,
  isMusicKitAuthorized,
  normalizeITunesTracks,
  normalizeMusicKitSearchResults
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
});
