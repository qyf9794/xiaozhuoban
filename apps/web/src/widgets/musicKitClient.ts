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

type MusicKitSearchOptions = { types: string; limit: number };
type MusicKitApiLike = {
  search?: (term: string, options: MusicKitSearchOptions) => Promise<unknown>;
  music?: (path: string, params?: Record<string, string | number>) => Promise<unknown>;
};
type FetchLike = (input: string | URL, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type MusicKitInstanceLike = {
  authorize: () => Promise<string>;
  unauthorize?: () => Promise<void>;
  setQueue: (descriptor: Record<string, string>) => Promise<unknown>;
  play: () => Promise<unknown>;
  pause: () => Promise<unknown> | void;
  skipToNextItem?: () => Promise<unknown>;
  isAuthorized?: boolean;
  storefrontId?: string;
  api?: MusicKitApiLike;
};

type MusicKitGlobal = {
  configure: (options: {
    developerToken: string;
    app: { name: string; build: string };
    suppressErrorDialog?: boolean;
  }) => MusicKitInstanceLike | undefined;
  getInstance?: () => MusicKitInstanceLike | undefined;
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
  const root = payload && typeof payload === "object" ? (payload as { results?: unknown; songs?: unknown; albums?: unknown; playlists?: unknown }) : {};
  const results =
    root.results && typeof root.results === "object"
      ? (root.results as { songs?: unknown; albums?: unknown; playlists?: unknown })
      : root;
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

export function isMusicKitAuthorized(music: MusicKitInstanceLike | null | undefined): boolean {
  return music?.isAuthorized === true;
}

export function inferAppleMusicStorefront(locale: string | undefined, fallback = "us"): string {
  const region = locale?.split("-")[1]?.trim().toLowerCase();
  return region && /^[a-z]{2}$/.test(region) ? region : fallback;
}

export async function searchAppleMusicCatalog(music: MusicKitInstanceLike, term: string, options: MusicKitSearchOptions): Promise<unknown> {
  const keyword = term.trim();
  if (!keyword) return {};
  const api = music.api;
  if (typeof api?.search === "function") {
    return api.search(keyword, options);
  }
  if (typeof api?.music === "function") {
    const params = { term: keyword, types: options.types, limit: options.limit };
    try {
      return await api.music("/v1/catalog/{{storefrontId}}/search", params);
    } catch (error) {
      const storefront = music.storefrontId?.trim() || "us";
      if (String(error instanceof Error ? error.message : error).includes("{{storefrontId}}")) {
        return api.music(`/v1/catalog/${storefront}/search`, params);
      }
      throw error;
    }
  }
  throw new Error("MusicKit SDK 不支持目录搜索");
}

export async function searchAppleMusicCatalogApi(
  developerToken: string,
  term: string,
  options: MusicKitSearchOptions,
  storefront = "us",
  fetchLike: FetchLike = fetch
): Promise<unknown> {
  const token = developerToken.trim();
  const keyword = term.trim();
  if (!token) {
    throw new Error("未配置 Apple Music Developer Token");
  }
  if (!keyword) return {};
  const url = new URL(`https://api.music.apple.com/v1/catalog/${storefront}/search`);
  url.searchParams.set("term", keyword);
  url.searchParams.set("types", options.types);
  url.searchParams.set("limit", String(options.limit));
  const response = await fetchLike(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Apple Music 搜索失败 (${response.status})`);
  }
  return response.json();
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
  const configured = musicKit.configure({
    developerToken: token,
    app: { name: "小桌板", build: "xiaozhuoban-web" },
    suppressErrorDialog: true
  });
  const instance = musicKit.getInstance?.() ?? configured;
  if (!instance) {
    throw new Error("MusicKit SDK 未返回播放器实例");
  }
  return instance;
}
