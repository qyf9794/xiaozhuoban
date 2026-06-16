export type MusicSource = "apple" | "itunes";
export type MusicItemKind = "song" | "album" | "playlist";

export interface MusicSearchItem {
  id: string;
  source: MusicSource;
  kind: MusicItemKind;
  title: string;
  subtitle: string;
  artworkUrl?: string;
  previewUrl?: string;
  url?: string;
}

export interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
}

type MusicKitResource = {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    curatorName?: string;
    artwork?: { url?: string };
    url?: string;
  };
};

export type MusicKitInstanceLike = {
  authorize: () => Promise<string>;
  unauthorize?: () => Promise<void>;
  setQueue: (descriptor: Record<string, string>) => Promise<unknown>;
  play: () => Promise<unknown>;
  pause: () => Promise<unknown> | void;
  skipToNextItem?: () => Promise<unknown>;
  isAuthorized?: boolean;
  api?: {
    search: (term: string, options: { types: string; limit: number }) => Promise<unknown>;
  };
};

type MusicKitGlobal = {
  configure: (options: {
    developerToken: string;
    app: { name: string; build: string };
    suppressErrorDialog?: boolean;
  }) => MusicKitInstanceLike;
  getInstance: () => MusicKitInstanceLike;
};

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
    __xiaozhuobanMusicKitScriptPromise?: Promise<MusicKitGlobal>;
  }
}

export const MUSIC_KIT_SCRIPT_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

export function getMusicKitDeveloperToken(): string {
  return String(import.meta.env.VITE_APPLE_MUSIC_DEVELOPER_TOKEN ?? "").trim();
}

export function formatMusicArtworkUrl(url: string | undefined, size = 240): string | undefined {
  if (!url) return undefined;
  return url.replace("{w}", String(size)).replace("{h}", String(size));
}

function itemKindFromResource(type: string | undefined): MusicItemKind {
  if (type === "albums") return "album";
  if (type === "playlists") return "playlist";
  return "song";
}

function normalizeResource(resource: MusicKitResource): MusicSearchItem | null {
  const id = resource.id?.trim();
  const attributes = resource.attributes;
  const title = attributes?.name?.trim();
  if (!id || !title) return null;
  const kind = itemKindFromResource(resource.type);
  return {
    id,
    source: "apple",
    kind,
    title,
    subtitle: attributes?.artistName?.trim() || attributes?.curatorName?.trim() || (kind === "album" ? "专辑" : "播放列表"),
    artworkUrl: formatMusicArtworkUrl(attributes?.artwork?.url),
    url: attributes?.url
  };
}

export function normalizeMusicKitSearchResults(payload: unknown): MusicSearchItem[] {
  const results = payload && typeof payload === "object" ? (payload as { songs?: unknown; albums?: unknown; playlists?: unknown }) : {};
  return [results.songs, results.albums, results.playlists]
    .flatMap((group) => {
      const data = group && typeof group === "object" ? (group as { data?: unknown }).data : undefined;
      return Array.isArray(data) ? data : [];
    })
    .map((item) => normalizeResource(item as MusicKitResource))
    .filter((item): item is MusicSearchItem => Boolean(item));
}

export function normalizeITunesTracks(items: ITunesTrack[]): MusicSearchItem[] {
  return items.map((track) => ({
    id: String(track.trackId),
    source: "itunes",
    kind: "song",
    title: track.trackName,
    subtitle: track.artistName,
    artworkUrl: track.artworkUrl100?.replace("100x100bb", "240x240bb"),
    previewUrl: track.previewUrl
  }));
}

export function createMusicKitQueueDescriptor(item: MusicSearchItem): Record<string, string> {
  if (item.kind === "album") return { album: item.id };
  if (item.kind === "playlist") return { playlist: item.id };
  return { song: item.id };
}

export function loadMusicKitScript(windowLike: Window = window): Promise<MusicKitGlobal> {
  if (windowLike.MusicKit) return Promise.resolve(windowLike.MusicKit);
  if (windowLike.__xiaozhuobanMusicKitScriptPromise) return windowLike.__xiaozhuobanMusicKitScriptPromise;

  windowLike.__xiaozhuobanMusicKitScriptPromise = new Promise<MusicKitGlobal>((resolve, reject) => {
    const script = windowLike.document.createElement("script");
    script.src = MUSIC_KIT_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (windowLike.MusicKit) {
        resolve(windowLike.MusicKit);
      } else {
        reject(new Error("MusicKit SDK 未加载"));
      }
    };
    script.onerror = () => reject(new Error("MusicKit SDK 加载失败"));
    windowLike.document.head.appendChild(script);
  });

  return windowLike.__xiaozhuobanMusicKitScriptPromise;
}

export async function configureMusicKit(developerToken: string, windowLike: Window = window): Promise<MusicKitInstanceLike> {
  const token = developerToken.trim();
  if (!token) {
    throw new Error("未配置 Apple Music Developer Token");
  }
  const musicKit = await loadMusicKitScript(windowLike);
  musicKit.configure({
    developerToken: token,
    app: { name: "小桌板", build: "xiaozhuoban-web" },
    suppressErrorDialog: true
  });
  return musicKit.getInstance();
}
