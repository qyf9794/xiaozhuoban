import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  acceptMatch,
  cancelMatch,
  createPendingMatch,
  declineMatch,
  expireMatch,
  isPendingMatchExpired,
  MONOPOLY_ACTIVE_STATUSES,
  MONOPOLY_VISIBLE_STATUSES,
  normalizeMonopolyState,
  purchaseProperty,
  skipProperty,
  sortMatches,
  startMatch,
  submitRoll,
  type MonopolyMatch,
  type MonopolyMatchStatus,
  type MonopolyPhase
} from "./monopoly";

const visibleStatusSet = new Set<MonopolyMatchStatus>([...MONOPOLY_VISIBLE_STATUSES]);

export interface MonopolyMatchRow {
  id: string;
  host_user_id: string;
  host_user_name: string;
  participant_ids: string[];
  status: MonopolyMatchStatus;
  phase: MonopolyPhase;
  state: unknown;
  revision: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string | null;
}

function readErrorText(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }
  const parts = ["message", "details", "hint", "code"]
    .map((key) => {
      const value = (error as Record<string, unknown>)[key];
      return typeof value === "string" ? value : "";
    })
    .filter(Boolean);
  return parts.join(" ").toLowerCase();
}

function isMissingMonopolyTableError(error: unknown) {
  const text = readErrorText(error);
  return (
    text.includes("monopoly_matches") &&
    (text.includes("404") ||
      text.includes("42p01") ||
      text.includes("pgrst205") ||
      text.includes("could not find the table") ||
      text.includes("relation") ||
      text.includes("schema cache"))
  );
}

export function toMonopolyOnlineError(error: unknown, fallback = "在线房间加载失败") {
  if (isMissingMonopolyTableError(error)) {
    return new Error("在线大富翁未初始化，请先在 Supabase 执行最新 schema.sql 里的 monopoly_matches 建表语句");
  }
  if (error instanceof Error && error.message) {
    return error;
  }
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return new Error(message);
    }
  }
  return new Error(fallback);
}

export function normalizeMonopolyMatchRow(row: MonopolyMatchRow): MonopolyMatch {
  return {
    id: row.id,
    hostUserId: row.host_user_id,
    hostUserName: row.host_user_name,
    participantIds: Array.isArray(row.participant_ids) ? row.participant_ids.filter((item) => typeof item === "string") : [],
    status: row.status,
    phase: row.phase ?? "lobby",
    state: normalizeMonopolyState(row.state),
    revision: Number(row.revision) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    expiresAt: row.expires_at
  };
}

export function matchToInsertPayload(match: MonopolyMatch) {
  return {
    id: match.id,
    host_user_id: match.hostUserId,
    host_user_name: match.hostUserName,
    participant_ids: match.participantIds,
    status: match.status,
    phase: match.phase,
    state: match.state,
    revision: match.revision,
    created_at: match.createdAt,
    updated_at: match.updatedAt,
    started_at: match.startedAt,
    finished_at: match.finishedAt,
    expires_at: match.expiresAt
  };
}

export function rowMatchesUser(row: MonopolyMatchRow, userId: string) {
  return row.host_user_id === userId || (Array.isArray(row.participant_ids) && row.participant_ids.includes(userId));
}

async function refreshExpiredMatches(matches: MonopolyMatch[], currentTime = new Date().toISOString()) {
  const expired = matches.filter((match) => isPendingMatchExpired(match, currentTime));
  if (expired.length === 0) {
    return matches;
  }

  const next = await Promise.all(
    matches.map(async (match) => {
      if (!isPendingMatchExpired(match, currentTime)) {
        return match;
      }
      const expiredMatch = expireMatch(match, currentTime);
      const { data, error } = await supabase
        .from("monopoly_matches")
        .update(matchToInsertPayload(expiredMatch))
        .eq("id", match.id)
        .eq("revision", match.revision)
        .select("*")
        .maybeSingle();
      if (error) {
        return expiredMatch;
      }
      return data ? normalizeMonopolyMatchRow(data as MonopolyMatchRow) : expiredMatch;
    })
  );

  return sortMatches(next.filter((match) => visibleStatusSet.has(match.status)));
}

async function updateMatchWithRevision(current: MonopolyMatch, next: MonopolyMatch) {
  const { data, error } = await supabase
    .from("monopoly_matches")
    .update(matchToInsertPayload(next))
    .eq("id", current.id)
    .eq("revision", current.revision)
    .select("*")
    .maybeSingle();

  if (error) {
    throw toMonopolyOnlineError(error, "在线操作失败");
  }
  if (!data) {
    throw new Error("房间状态已更新，请刷新后重试");
  }
  return normalizeMonopolyMatchRow(data as MonopolyMatchRow);
}

export async function listRelevantMatches(userId: string) {
  const { data, error } = await supabase
    .from("monopoly_matches")
    .select("*")
    .contains("participant_ids", [userId])
    .in("status", [...MONOPOLY_VISIBLE_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw toMonopolyOnlineError(error);
  }

  const matches = ((data as MonopolyMatchRow[] | null) ?? []).map(normalizeMonopolyMatchRow);
  return refreshExpiredMatches(matches);
}

export async function createOnlineMatch(params: {
  hostUserId: string;
  hostUserName: string;
  invitees: Array<{ userId: string; userName: string }>;
}) {
  const { data: existing, error: existingError } = await supabase
    .from("monopoly_matches")
    .select("*")
    .contains("participant_ids", [params.hostUserId])
    .in("status", [...MONOPOLY_ACTIVE_STATUSES])
    .limit(10);

  if (existingError) {
    throw toMonopolyOnlineError(existingError, "在线房间加载失败");
  }

  const duplicates = await refreshExpiredMatches(((existing as MonopolyMatchRow[] | null) ?? []).map(normalizeMonopolyMatchRow));
  if (duplicates.some((match) => MONOPOLY_ACTIVE_STATUSES.includes(match.status as (typeof MONOPOLY_ACTIVE_STATUSES)[number]))) {
    throw new Error("你已经有进行中的邀请或房间");
  }

  const match = createPendingMatch(params);
  const { data, error } = await supabase.from("monopoly_matches").insert(matchToInsertPayload(match)).select("*").single();
  if (error) {
    throw toMonopolyOnlineError(error, "创建房间失败");
  }
  return normalizeMonopolyMatchRow(data as MonopolyMatchRow);
}

export async function acceptOnlineMatch(match: MonopolyMatch, userId: string) {
  return updateMatchWithRevision(match, acceptMatch(match, userId));
}

export async function declineOnlineMatch(match: MonopolyMatch, userId: string) {
  return updateMatchWithRevision(match, declineMatch(match, userId));
}

export async function cancelOnlineMatch(match: MonopolyMatch, hostUserId: string) {
  return updateMatchWithRevision(match, cancelMatch(match, hostUserId));
}

export async function startOnlineMatch(match: MonopolyMatch, hostUserId: string) {
  return updateMatchWithRevision(match, startMatch(match, hostUserId));
}

export async function submitOnlineRoll(match: MonopolyMatch, userId: string) {
  return updateMatchWithRevision(match, submitRoll(match, { userId }));
}

export async function purchaseOnlineProperty(match: MonopolyMatch, userId: string) {
  return updateMatchWithRevision(match, purchaseProperty(match, userId));
}

export async function skipOnlineProperty(match: MonopolyMatch, userId: string) {
  return updateMatchWithRevision(match, skipProperty(match, userId));
}

export function subscribeToUserMatches(userId: string, onMatchChange: (match: MonopolyMatch) => void) {
  const channel: RealtimeChannel = supabase.channel(`monopoly-matches-${userId}-${Math.random().toString(36).slice(2, 8)}`);
  const handler = (payload: { new: Record<string, unknown> }) => {
    const row = payload.new as unknown as MonopolyMatchRow;
    if (!row?.id || !rowMatchesUser(row, userId)) {
      return;
    }
    onMatchChange(normalizeMonopolyMatchRow(row));
  };

  channel.on("postgres_changes", { event: "*", schema: "public", table: "monopoly_matches" }, handler).subscribe();
  return channel;
}

export async function removeMatchChannel(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
