import { summarizeTvChannelNamesForAssistant, type TvChannel } from "./tvShared";

const TV_ASSISTANT_CHANNEL_CATALOG_KEY = "xiaozhuoban.tv.assistantChannelCatalog.v1";

export type TvAssistantChannelCatalog = {
  channelNames: string[];
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
  const channelNames = Array.isArray(record.channelNames)
    ? record.channelNames.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const channelCount = typeof record.channelCount === "number" && Number.isFinite(record.channelCount)
    ? Math.max(0, Math.round(record.channelCount))
    : channelNames.length;
  if (channelNames.length === 0 && channelCount === 0) return null;
  return {
    channelNames,
    channelCount,
    selectedChannelName: typeof record.selectedChannelName === "string" && record.selectedChannelName.trim()
      ? record.selectedChannelName.trim()
      : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString()
  };
}

export function rememberTvAssistantChannelCatalog(channels: TvChannel[], selectedChannelName?: string): void {
  if (!canUseStorage()) return;
  const catalog: TvAssistantChannelCatalog = {
    channelNames: summarizeTvChannelNamesForAssistant(channels),
    channelCount: channels.length,
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
