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
  skipToPreviousItem?: () => Promise<unknown>;
  currentPlaybackTime?: number;
  currentPlaybackDuration?: number;
  currentPlaybackProgress?: number;
  isAuthorized?: boolean;
  storefrontId?: string;
  api?: MusicKitApiLike;
};

type MusicKitGlobal = {
  configure: (options: {
    developerToken: string;
    app: { name: string; build: string };
    suppressErrorDialog?: boolean;
    features?: string[];
  }) => MusicKitInstanceLike | undefined;
  getInstance?: () => MusicKitInstanceLike | undefined;
};

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
    __xiaozhuobanMusicKitScriptPromise?: Promise<MusicKitGlobal>;
    __xiaozhuobanMusicKitConfigurePromise?: Promise<MusicKitInstanceLike>;
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

/**
 * Keep authorization and playback SDK calls synchronous with the originating
 * click. Mobile browsers can consume transient user activation at the first
 * asynchronous boundary, so callers must not await queue/search work first.
 */
export function requestMusicKitAuthorizationFromUserGesture(music: MusicKitInstanceLike): Promise<string> {
  return music.authorize();
}

export function startMusicKitPlaybackFromUserGesture(music: MusicKitInstanceLike): Promise<unknown> {
  return music.play();
}

type MusicKitPlaybackCommandState = "unknown" | "prepared" | "starting" | "playing" | "paused";

/**
 * MusicKit rejects overlapping player mutations (especially a second play
 * while the previous play is still active). Keep every SDK mutation on one
 * ordered lane and make repeated play/resume requests idempotent.
 *
 * The explicit user-gesture entry point stays synchronous so mobile browsers
 * can consume the click activation without crossing an async boundary.
 */
export class MusicKitPlaybackSequencer {
  private tail: Promise<void> = Promise.resolve();
  private pendingCommands = 0;
  private state: MusicKitPlaybackCommandState = "unknown";
  private preparedItemId: string | null = null;
  private activePlayPromise: Promise<unknown> | null = null;

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingCommands += 1;
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result.finally(() => {
      this.pendingCommands = Math.max(0, this.pendingCommands - 1);
    });
  }

  isPrepared(itemId: string): boolean {
    return this.preparedItemId === itemId;
  }

  isPlaying(): boolean {
    return this.state === "playing" || this.state === "starting";
  }

  prepareQueue(
    music: MusicKitInstanceLike,
    itemId: string,
    descriptor: Record<string, string>
  ): Promise<void> {
    return this.enqueue(async () => {
      if (this.preparedItemId === itemId) return;

      // Pause before replacing the queue. This is safe for an idle player and
      // is required when search/switch arrives while another item is playing.
      await music.pause();
      this.state = "paused";
      await music.setQueue(descriptor);
      this.preparedItemId = itemId;
      this.state = "prepared";
    });
  }

  play(music: MusicKitInstanceLike): Promise<unknown> {
    return this.enqueue(async () => {
      if (this.state === "playing") return;
      if (this.state === "starting" && this.activePlayPromise) {
        return this.activePlayPromise;
      }

      this.state = "starting";
      const playPromise = music.play();
      this.activePlayPromise = playPromise;
      try {
        const result = await playPromise;
        this.state = "playing";
        return result;
      } catch (error) {
        this.state = this.preparedItemId ? "prepared" : "paused";
        throw error;
      } finally {
        if (this.activePlayPromise === playPromise) this.activePlayPromise = null;
      }
    });
  }

  playFromUserGesture(music: MusicKitInstanceLike): Promise<unknown> {
    if (this.state === "playing") return Promise.resolve();
    if (this.state === "starting" && this.activePlayPromise) return this.activePlayPromise;
    if (this.pendingCommands > 0) {
      return Promise.reject(new Error("MusicKit 播放器正在完成上一条指令，请稍后再次点击播放"));
    }

    this.state = "starting";
    let playPromise: Promise<unknown>;
    try {
      // Do not insert an await before this SDK call: it must run in the click.
      playPromise = music.play();
    } catch (error) {
      this.state = this.preparedItemId ? "prepared" : "paused";
      return Promise.reject(error);
    }
    this.activePlayPromise = playPromise;
    void playPromise.then(
      () => {
        this.state = "playing";
      },
      () => {
        this.state = this.preparedItemId ? "prepared" : "paused";
      }
    ).finally(() => {
      if (this.activePlayPromise === playPromise) this.activePlayPromise = null;
    });
    return playPromise;
  }

  pause(music: MusicKitInstanceLike): Promise<void> {
    return this.enqueue(async () => {
      await music.pause();
      this.state = "paused";
    });
  }
}

const musicKitPlaybackSequencers = new WeakMap<object, MusicKitPlaybackSequencer>();

export function getMusicKitPlaybackSequencer(music: MusicKitInstanceLike): MusicKitPlaybackSequencer {
  const key = music as object;
  const existing = musicKitPlaybackSequencers.get(key);
  if (existing) return existing;
  const sequencer = new MusicKitPlaybackSequencer();
  musicKitPlaybackSequencers.set(key, sequencer);
  return sequencer;
}

/**
 * Read an elapsed playback clock from MusicKit across SDK variants.
 * Some releases expose seconds directly while others expose only progress.
 */
export function readMusicKitPlaybackTime(music: MusicKitInstanceLike | null | undefined): number {
  const currentTime = music?.currentPlaybackTime;
  if (typeof currentTime === "number" && Number.isFinite(currentTime) && currentTime >= 0) {
    return currentTime;
  }

  const duration = music?.currentPlaybackDuration;
  const progress = music?.currentPlaybackProgress;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    typeof progress !== "number" ||
    !Number.isFinite(progress) ||
    progress < 0
  ) {
    return 0;
  }

  const normalizedProgress = progress <= 1 ? progress : progress / 100;
  return duration * Math.min(1, normalizedProgress);
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

  const existing = windowLike.MusicKit?.getInstance?.();
  if (existing) return existing;

  if (windowLike.__xiaozhuobanMusicKitConfigurePromise) {
    return windowLike.__xiaozhuobanMusicKitConfigurePromise;
  }

  const configuration = loadMusicKitScript(windowLike).then((musicKit) => {
    const current = musicKit.getInstance?.();
    if (current) return current;

    const configured = musicKit.configure({
      developerToken: token,
      app: { name: "小桌板", build: "xiaozhuoban-web" },
      suppressErrorDialog: true,
      features: ["player-accurate-timing"]
    });
    const instance = musicKit.getInstance?.() ?? configured;
    if (!instance) {
      throw new Error("MusicKit SDK 未返回播放器实例");
    }
    return instance;
  });
  windowLike.__xiaozhuobanMusicKitConfigurePromise = configuration;

  try {
    return await configuration;
  } catch (error) {
    if (windowLike.__xiaozhuobanMusicKitConfigurePromise === configuration) {
      delete windowLike.__xiaozhuobanMusicKitConfigurePromise;
    }
    throw error;
  }
}
