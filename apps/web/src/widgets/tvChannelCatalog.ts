import { summarizeTvChannelNamesForAssistant, type TvChannel } from "./tvShared";

const TV_ASSISTANT_CHANNEL_CATALOG_KEY = "xiaozhuoban.tv.assistantChannelCatalog.v1";

export type TvAssistantChannelCatalog = {
  channelNames: string[];
  channels: TvChannel[];
  channelCount: number;
  selectedChannelName?: string;
  updatedAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeCatalog(value: unknown): TvAssistantChannelCatalog | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const channels = Array.isArray(record.channels)
    ? record.channels
        .map((item, index): TvChannel | null => {
          if (!item || typeof item !== "object") return null;
          const channel = item as Record<string, unknown>;
          const name = typeof channel.name === "string" ? channel.name.replace(/\s+/g, " ").trim() : "";
          const url = typeof channel.url === "string" ? channel.url.trim() : "";
          if (!name || !url) return null;
          return {
            id: typeof channel.id === "string" && channel.id.trim() ? channel.id.trim() : `assistant_catalog_${index}`,
            name,
            url
          };
        })
        .filter((item): item is TvChannel => Boolean(item))
    : [];
  const channelNames = Array.isArray(record.channelNames)
    ? record.channelNames.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : summarizeTvChannelNamesForAssistant(channels);
  const channelCount = typeof record.channelCount === "number" && Number.isFinite(record.channelCount)
    ? Math.max(0, Math.round(record.channelCount))
    : Math.max(channelNames.length, channels.length);
  if (channelNames.length === 0 && channelCount === 0) return null;
  return {
    channelNames,
    channels,
    channelCount,
    selectedChannelName: typeof record.selectedChannelName === "string" && record.selectedChannelName.trim()
      ? record.selectedChannelName.trim()
      : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString()
  };
}

export function rememberTvAssistantChannelCatalog(channels: TvChannel[], selectedChannelName?: string): void {
  if (!canUseStorage()) return;
  const compactChannels = channels
    .map((channel) => ({
      id: channel.id,
      name: channel.name.replace(/\s+/g, " ").trim(),
      url: channel.url.trim()
    }))
    .filter((channel) => channel.name && channel.url);
  const catalog: TvAssistantChannelCatalog = {
    channelNames: summarizeTvChannelNamesForAssistant(compactChannels),
    channels: compactChannels,
    channelCount: compactChannels.length,
    selectedChannelName: selectedChannelName?.replace(/\s+/g, " ").trim() || undefined,
    updatedAt: new Date().toISOString()
  };
  try {
    window.localStorage.setItem(TV_ASSISTANT_CHANNEL_CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    // Best-effort assistant context cache only.
  }
}

export function readTvAssistantChannelCatalog(): TvAssistantChannelCatalog | null {
  if (!canUseStorage()) return null;
  try {
    return normalizeCatalog(JSON.parse(window.localStorage.getItem(TV_ASSISTANT_CHANNEL_CATALOG_KEY) ?? "null"));
  } catch {
    return null;
  }
}
