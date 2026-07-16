export const DEFAULT_TV_PLAYLIST_URL =
  "https://raw.githubusercontent.com/YueChan/Live/refs/heads/main/Global.m3u";

export const TV_WIDGET_SIZE_LIMITS = {
  minW: 240,
  maxW: 498,
  fixedH: 480
} as const;

export interface TvChannel {
  id: string;
  name: string;
  url: string;
}

export const TV_ASSISTANT_CHANNEL_NAME_LIMIT = 240;

export const FALLBACK_TV_CHANNELS: TvChannel[] = [
  {
    id: "tv_fallback_cctv13",
    name: "CCTV-13 新闻",
    url: "https://cd-live-stream.news.cctvplus.com/live/smil:CHANNEL1.smil/playlist.m3u8"
  },
  {
    id: "tv_fallback_cctv6",
    name: "CCTV-6 电影",
    url: "http://69.30.245.50/live/cctv6.m3u8"
  },
  {
    id: "tv_fallback_cctv5",
    name: "CCTV-5 体育",
    url: "http://www.douzhicloud.site:35455/gaoma/cctv5.m3u8"
  },
  {
    id: "tv_fallback_bbc_news",
    name: "BBC News",
    url: "https://vs-hls-push-ww-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/t=3840/v=pv14/b=5070016/main.m3u8"
  },
  {
    id: "tv_fallback_nhk_world",
    name: "NHK World-Japan",
    url: "https://media-tyo.hls.nhkworld.jp/hls/w/live/master.m3u8"
  },
  {
    id: "tv_fallback_bloomberg_tv",
    name: "Bloomberg TV",
    url: "https://liveprodusphoenixeast.global.ssl.fastly.net/USPhx-HD/Channel-TX-USPhx-AWS-virginia-1/Source-USPhx-16k-1-s6lk2-BP-07-02-81ykIWnsMsg_live.m3u8"
  }
];

function normalizeChannelName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

export function normalizeTvChannelSearchName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/BLOOMBERG\s*(?:TELEVISION|TV)?/g, "BLOOMBERG")
    .replace(/高清|标清|频道|综合|新闻|财经|体育|电影|电视剧|少儿/g, "")
    .replace(/[\s_-]+/g, "")
    .trim();
}

export function findTvChannel(channels: TvChannel[], channelName: string): TvChannel | undefined {
  const query = channelName.trim();
  if (!query) return undefined;
  const normalizedQuery = normalizeTvChannelSearchName(query);
  return channels.find((channel) => {
    const normalizedName = normalizeTvChannelSearchName(channel.name);
    return (
      channel.name.includes(query) ||
      query.includes(channel.name) ||
      (Boolean(normalizedQuery) && (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)))
    );
  });
}

export function summarizeTvChannelNamesForAssistant(
  channels: TvChannel[],
  limit = TV_ASSISTANT_CHANNEL_NAME_LIMIT
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const channel of channels) {
    const name = channel.name.replace(/\s+/g, " ").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}

export function findFallbackTvChannel(channelName: string): TvChannel | undefined {
  if (/(央视新闻|中央新闻|新闻频道|CCTV\s*-?\s*新闻)/i.test(channelName)) {
    return FALLBACK_TV_CHANNELS.find((channel) => channel.id === "tv_fallback_cctv13");
  }
  if (/(电影频道|央视电影|中央电影|CCTV\s*-?\s*6|CCTV\s*-?\s*电影)/i.test(channelName)) {
    return FALLBACK_TV_CHANNELS.find((channel) => channel.id === "tv_fallback_cctv6");
  }
  if (/(体育频道|央视体育|中央体育|CCTV\s*-?\s*5|CCTV\s*-?\s*体育)/i.test(channelName)) {
    return FALLBACK_TV_CHANNELS.find((channel) => channel.id === "tv_fallback_cctv5");
  }
  return findTvChannel(FALLBACK_TV_CHANNELS, channelName);
}

export function resolveTvPlaylistSelection(
  channels: TvChannel[],
  preferredUrl: string,
  preferredName: string
): { channels: TvChannel[]; selected: TvChannel | undefined } {
  const url = preferredUrl.trim();
  const name = preferredName.trim();
  const selected =
    (url ? channels.find((channel) => channel.url === url) : undefined) ??
    (name ? findTvChannel(channels, name) : undefined);

  if (selected) {
    return { channels, selected };
  }

  const fallback = name ? findFallbackTvChannel(name) : undefined;
  const external = url ? { id: `tv_external_${Math.abs(hashString(url))}`, name: name || fallback?.name || "自定义频道", url } : fallback;
  if (external) {
    return {
      channels: channels.some((channel) => channel.url === external.url) ? channels : [external, ...channels],
      selected: external
    };
  }

  return { channels, selected: channels[0] };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

export function parseM3UPlaylist(content: string): TvChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: TvChannel[] = [];
  let pendingName = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const nameFromExtinf = line.includes(",") ? line.slice(line.lastIndexOf(",") + 1) : "";
      pendingName = normalizeChannelName(nameFromExtinf, `频道 ${channels.length + 1}`);
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    const name = normalizeChannelName(pendingName, `频道 ${channels.length + 1}`);
    channels.push({
      id: `tv_channel_${i}_${channels.length}`,
      name,
      url: line
    });
    pendingName = "";
  }

  return channels;
}

export function clampTvWidgetSize(w: number, h: number): { w: number; h: number } {
  const width = Math.max(TV_WIDGET_SIZE_LIMITS.minW, Math.min(TV_WIDGET_SIZE_LIMITS.maxW, Math.round(w)));
  return { w: width, h: TV_WIDGET_SIZE_LIMITS.fixedH };
}
