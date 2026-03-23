import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  acceptMatch,
  abandonMatch,
  autoReturnTributesIfNeeded,
  cancelMatch,
  createPendingMatch,
  declineMatch,
  expireMatch,
  GUANDAN_ACTIVE_STATUSES,
  GUANDAN_VISIBLE_STATUSES,
  isPendingMatchExpired,
  normalizeGuandanState,
  passTurn,
  restartMatch,
  rowMatchesUser,
  sortMatches,
  startMatch,
  submitPlay,
  submitTribute,
  type GuandanMatch,
  type GuandanMatchStatus,
  type GuandanPhase
} from "./guandan";

const visibleStatusSet = new Set<GuandanMatchStatus>([...GUANDAN_VISIBLE_STATUSES]);

export interface GuandanMatchRow {
  id: string;
  host_user_id: string;
  host_user_name: string;
  participant_ids: string[];
  status: GuandanMatchStatus;
  phase: GuandanPhase;
  state: unknown;
  revision: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string | null;
}

function readErrorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  return ["message", "details", "hint", "code"]
    .map((key) => {
      const value = (error as Record<string, unknown>)[key];
      return typeof value === "string" ? value : "";
    })
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isMissingGuandanTableError(error: unknown) {
  const text = readErrorText(error);
  return (
    text.includes("guandan_matches") &&
    (text.includes("404") ||
      text.includes("42p01") ||
      text.includes("pgrst205") ||
      text.includes("could not find the table") ||
      text.includes("relation") ||
      text.includes("schema cache"))
  );
}

export function toGuandanOnlineError(error: unknown, fallback = "掼蛋房间加载失败") {
  if (isMissingGuandanTableError(error)) {
    return new Error("在线掼蛋未初始化，请先在 Supabase 执行最新 schema.sql 里的 guandan_matches 建表语句");
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

export function normalizeGuandanMatchRow(row: GuandanMatchRow): GuandanMatch {
  return {
    id: row.id,
    hostUserId: row.host_user_id,
    hostUserName: row.host_user_name,
    participantIds: Array.isArray(row.participant_ids) ? row.participant_ids.filter((item) => typeof item === "string") : [],
    status: row.status,
    phase: row.phase,
    state: normalizeGuandanState(row.state),
    revision: Number(row.revision) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    expiresAt: row.expires_at
  };
}

export function matchToInsertPayload(match: GuandanMatch) {
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

async function refreshExpiredMatches(matches: GuandanMatch[], currentTime = new Date().toISOString()) {
  const expired = matches.filter((match) => isPendingMatchExpired(match, currentTime));
  if (expired.length === 0) return matches;

  const next = await Promise.all(
    matches.map(async (match) => {
      if (!isPendingMatchExpired(match, currentTime)) return match;
      const expiredMatch = expireMatch(match, currentTime);
      const { data, error } = await supabase
        .from("guandan_matches")
        .update(matchToInsertPayload(expiredMatch))
        .eq("id", match.id)
        .eq("revision", match.revision)
        .select("*")
        .maybeSingle();
      if (error) return expiredMatch;
      return data ? normalizeGuandanMatchRow(data as GuandanMatchRow) : expiredMatch;
    })
  );

  return sortMatches(next.filter((match) => visibleStatusSet.has(match.status)));
}

async function updateMatchWithRevision(current: GuandanMatch, next: GuandanMatch) {
  const { data, error } = await supabase
    .from("guandan_matches")
    .update(matchToInsertPayload(next))
    .eq("id", current.id)
    .eq("revision", current.revision)
    .select("*")
    .maybeSingle();

  if (error) {
    throw toGuandanOnlineError(error, "在线操作失败");
  }
  if (!data) {
    throw new Error("房间状态已更新，请刷新后重试");
  }
  return normalizeGuandanMatchRow(data as GuandanMatchRow);
}

export async function listRelevantMatches(userId: string) {
  const { data, error } = await supabase
    .from("guandan_matches")
    .select("*")
    .contains("participant_ids", [userId])
    .in("status", [...GUANDAN_VISIBLE_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw toGuandanOnlineError(error);
  }

  const matches = ((data as GuandanMatchRow[] | null) ?? []).map(normalizeGuandanMatchRow);
  return refreshExpiredMatches(matches);
}

export async function createOnlineMatch(params: {
  hostUserId: string;
  hostUserName: string;
  invitees: Array<{ userId: string; userName: string }>;
}) {
  const { data: existing, error: existingError } = await supabase
    .from("guandan_matches")
    .select("*")
    .contains("participant_ids", [params.hostUserId])
    .in("status", [...GUANDAN_ACTIVE_STATUSES])
    .limit(10);

  if (existingError) {
    throw toGuandanOnlineError(existingError, "在线房间加载失败");
  }

  const duplicates = await refreshExpiredMatches(((existing as GuandanMatchRow[] | null) ?? []).map(normalizeGuandanMatchRow));
  if (duplicates.some((match) => GUANDAN_ACTIVE_STATUSES.includes(match.status as (typeof GUANDAN_ACTIVE_STATUSES)[number]))) {
    throw new Error("你已经有进行中的掼蛋房间");
  }

  const match = createPendingMatch(params);
  const { data, error } = await supabase.from("guandan_matches").insert(matchToInsertPayload(match)).select("*").single();
  if (error) {
    throw toGuandanOnlineError(error, "创建房间失败");
  }
  return normalizeGuandanMatchRow(data as GuandanMatchRow);
}

export async function acceptOnlineMatch(match: GuandanMatch, userId: string) {
  return updateMatchWithRevision(match, acceptMatch(match, userId));
}

export async function declineOnlineMatch(match: GuandanMatch, userId: string) {
  return updateMatchWithRevision(match, declineMatch(match, userId));
}

export async function cancelOnlineMatch(match: GuandanMatch, hostUserId: string) {
  return updateMatchWithRevision(match, cancelMatch(match, hostUserId));
}

export async function startOnlineMatch(match: GuandanMatch, hostUserId: string) {
  return updateMatchWithRevision(match, startMatch(match, hostUserId));
}

export async function restartOnlineMatch(match: GuandanMatch, hostUserId: string) {
  return updateMatchWithRevision(match, restartMatch(match, hostUserId));
}

export async function submitOnlinePlay(match: GuandanMatch, params: { userId: string; cardIds: string[] }) {
  return updateMatchWithRevision(match, submitPlay(match, params));
}

export async function passOnlineTurn(match: GuandanMatch, userId: string) {
  return updateMatchWithRevision(match, passTurn(match, userId));
}

export async function submitOnlineTribute(match: GuandanMatch, params: { userId: string; cardId: string }) {
  const next = submitTribute(match, params);
  const autoReturned = autoReturnTributesIfNeeded(next);
  return updateMatchWithRevision(match, autoReturned);
}

export async function abandonOnlineMatch(match: GuandanMatch, userId: string) {
  return updateMatchWithRevision(match, abandonMatch(match, userId));
}

export function subscribeToUserMatches(userId: string, onMessage: (match: GuandanMatch) => void) {
  const handler = (payload: { eventType: string; new: unknown; old: unknown }) => {
    const row = (payload.new || payload.old) as GuandanMatchRow | null;
    if (!row) return;
    const match = normalizeGuandanMatchRow(row);
    if (rowMatchesUser(match, userId)) {
      onMessage(match);
    }
  };

  const channel: RealtimeChannel = supabase.channel(`guandan-matches-${userId}-${Math.random().toString(36).slice(2, 8)}`);
  channel.on("postgres_changes", { event: "*", schema: "public", table: "guandan_matches" }, handler).subscribe();
  return channel;
}

export async function removeMatchChannel(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
