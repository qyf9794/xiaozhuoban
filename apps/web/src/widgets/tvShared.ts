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

function normalizeChannelName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned || fallback;
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
