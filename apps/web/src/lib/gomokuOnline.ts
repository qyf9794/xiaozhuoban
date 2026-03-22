import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  acceptMatch,
  applyMoveToMatch,
  cancelMatch,
  confirmRematch,
  createPendingMatch,
  declineMatch,
  exitMatch,
  expireMatch,
  GOMOKU_ACTIVE_STATUSES,
  GOMOKU_VISIBLE_STATUSES,
  isPendingMatchExpired,
  normalizeBoardState,
  startNextRound,
  type GomokuMatch,
  type GomokuMatchStatus,
  type GomokuRoundState,
  type GomokuSeriesWinner,
  type GomokuStone,
  type GomokuWinner
} from "./gomoku";

const visibleStatusSet = new Set<GomokuMatchStatus>([...GOMOKU_VISIBLE_STATUSES]);
const activeStatusSet = new Set<GomokuMatchStatus>([...GOMOKU_ACTIVE_STATUSES]);

interface GomokuMatchRow {
  id: string;
  host_user_id: string;
  host_user_name: string;
  guest_user_id: string;
  guest_user_name: string;
  status: GomokuMatchStatus;
  round_state: GomokuRoundState;
  board_state: unknown;
  moves_count: number;
  current_turn: GomokuStone;
  winner: GomokuWinner | null;
  series_winner: GomokuSeriesWinner;
  current_round: number;
  host_wins: number;
  guest_wins: number;
  draw_count: number;
  black_user_id: string;
  white_user_id: string;
  rematch_host_confirmed: boolean;
  rematch_guest_confirmed: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  finished_at: string | null;
  round_finished_at: string | null;
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

function isMissingGomokuTableError(error: unknown) {
  const text = readErrorText(error);
  return (
    text.includes("gomoku_matches") &&
    (text.includes("404") ||
      text.includes("42p01") ||
      text.includes("pgrst205") ||
      text.includes("could not find the table") ||
      text.includes("relation") ||
      text.includes("schema cache"))
  );
}

export function toGomokuOnlineError(error: unknown, fallback = "在线对局加载失败") {
  if (isMissingGomokuTableError(error)) {
    return new Error("在线对战未初始化，请先在 Supabase 执行最新 schema.sql 里的 gomoku_matches 建表语句");
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

export function normalizeGomokuMatchRow(row: GomokuMatchRow): GomokuMatch {
  return {
    id: row.id,
    hostUserId: row.host_user_id,
    hostUserName: row.host_user_name,
    guestUserId: row.guest_user_id,
    guestUserName: row.guest_user_name,
    status: row.status,
    roundState: row.round_state ?? "playing",
    boardState: normalizeBoardState(row.board_state),
    movesCount: Number(row.moves_count) || 0,
    currentTurn: row.current_turn === "white" ? "white" : "black",
    winner: row.winner ?? null,
    seriesWinner: row.series_winner ?? null,
    currentRound: Number(row.current_round) || 1,
    hostWins: Number(row.host_wins) || 0,
    guestWins: Number(row.guest_wins) || 0,
    drawCount: Number(row.draw_count) || 0,
    blackUserId: row.black_user_id,
    whiteUserId: row.white_user_id,
    rematchHostConfirmed: row.rematch_host_confirmed === true,
    rematchGuestConfirmed: row.rematch_guest_confirmed === true,
    revision: Number(row.revision) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    finishedAt: row.finished_at,
    roundFinishedAt: row.round_finished_at,
    expiresAt: row.expires_at
  };
}

function matchToInsertPayload(match: GomokuMatch) {
  return {
    id: match.id,
    host_user_id: match.hostUserId,
    host_user_name: match.hostUserName,
    guest_user_id: match.guestUserId,
    guest_user_name: match.guestUserName,
    status: match.status,
    round_state: match.roundState,
    board_state: match.boardState,
    moves_count: match.movesCount,
    current_turn: match.currentTurn,
    winner: match.winner,
    series_winner: match.seriesWinner,
    current_round: match.currentRound,
    host_wins: match.hostWins,
    guest_wins: match.guestWins,
    draw_count: match.drawCount,
    black_user_id: match.blackUserId,
    white_user_id: match.whiteUserId,
    rematch_host_confirmed: match.rematchHostConfirmed,
    rematch_guest_confirmed: match.rematchGuestConfirmed,
    revision: match.revision,
    created_at: match.createdAt,
    updated_at: match.updatedAt,
    accepted_at: match.acceptedAt,
    finished_at: match.finishedAt,
    round_finished_at: match.roundFinishedAt,
    expires_at: match.expiresAt
  };
}

function sortMatches(items: GomokuMatch[]) {
  return [...items].sort((a, b) => {
    const priority = (status: GomokuMatchStatus) => {
      if (status === "active") return 0;
      if (status === "pending") return 1;
      if (status === "completed") return 2;
      return 3;
    };
    const diff = priority(a.status) - priority(b.status);
    if (diff !== 0) return diff;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

async function refreshExpiredMatches(matches: GomokuMatch[], currentTime = new Date().toISOString()) {
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
        .from("gomoku_matches")
        .update(matchToInsertPayload(expiredMatch))
        .eq("id", match.id)
        .eq("revision", match.revision)
        .select("*")
        .maybeSingle();
      if (error) {
        return expiredMatch;
      }
      return data ? normalizeGomokuMatchRow(data as GomokuMatchRow) : expiredMatch;
    })
  );

  return sortMatches(next.filter((match) => visibleStatusSet.has(match.status)));
}

async function updateMatchWithRevision(current: GomokuMatch, next: GomokuMatch) {
  const { data, error } = await supabase
    .from("gomoku_matches")
    .update(matchToInsertPayload(next))
    .eq("id", current.id)
    .eq("revision", current.revision)
    .select("*")
    .maybeSingle();

  if (error) {
    throw toGomokuOnlineError(error, "在线操作失败");
  }
  if (!data) {
    throw new Error("对局状态已更新，请刷新后重试");
  }
  return normalizeGomokuMatchRow(data as GomokuMatchRow);
}

export async function listRelevantMatches(userId: string) {
  const { data, error } = await supabase
    .from("gomoku_matches")
    .select("*")
    .or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`)
    .in("status", [...GOMOKU_VISIBLE_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw toGomokuOnlineError(error);
  }

  const matches = ((data as GomokuMatchRow[] | null) ?? []).map(normalizeGomokuMatchRow);
  return refreshExpiredMatches(matches);
}

export async function createOnlineMatch(params: {
  hostUserId: string;
  hostUserName: string;
  guestUserId: string;
  guestUserName: string;
}) {
  if (!params.hostUserId || !params.guestUserId || params.hostUserId === params.guestUserId) {
    throw new Error("请选择有效的对战用户");
  }

  const { data: existing, error: existingError } = await supabase
    .from("gomoku_matches")
    .select("*")
    .or(
      `and(host_user_id.eq.${params.hostUserId},guest_user_id.eq.${params.guestUserId}),and(host_user_id.eq.${params.guestUserId},guest_user_id.eq.${params.hostUserId})`
    )
    .in("status", [...GOMOKU_ACTIVE_STATUSES])
    .limit(5);

  if (existingError) {
    throw toGomokuOnlineError(existingError, "在线对局加载失败");
  }
  const duplicates = await refreshExpiredMatches(((existing as GomokuMatchRow[] | null) ?? []).map(normalizeGomokuMatchRow));
  if (duplicates.some((match) => activeStatusSet.has(match.status))) {
    throw new Error("你们之间已经有进行中的邀请或对局");
  }

  const match = createPendingMatch(params);
  const { data, error } = await supabase.from("gomoku_matches").insert(matchToInsertPayload(match)).select("*").single();
  if (error) {
    throw toGomokuOnlineError(error, "创建邀请失败");
  }
  return normalizeGomokuMatchRow(data as GomokuMatchRow);
}

export async function acceptOnlineMatch(match: GomokuMatch, guestUserId: string) {
  return updateMatchWithRevision(match, acceptMatch(match, guestUserId));
}

export async function declineOnlineMatch(match: GomokuMatch, guestUserId: string) {
  return updateMatchWithRevision(match, declineMatch(match, guestUserId));
}

export async function cancelOnlineMatch(match: GomokuMatch, hostUserId: string) {
  return updateMatchWithRevision(match, cancelMatch(match, hostUserId));
}

export async function submitOnlineMove(match: GomokuMatch, row: number, col: number, userId: string) {
  return updateMatchWithRevision(match, applyMoveToMatch(match, { row, col, userId }));
}

export async function advanceOnlineRound(match: GomokuMatch, userId: string) {
  return updateMatchWithRevision(match, startNextRound(match, userId));
}

export async function confirmOnlineRematch(match: GomokuMatch, userId: string) {
  return updateMatchWithRevision(match, confirmRematch(match, userId));
}

export async function exitOnlineSeries(match: GomokuMatch, userId: string) {
  return updateMatchWithRevision(match, exitMatch(match, userId));
}

export function subscribeToUserMatches(userId: string, onMatchChange: (match: GomokuMatch) => void) {
  const channel: RealtimeChannel = supabase.channel(`gomoku-matches-${userId}-${Math.random().toString(36).slice(2, 8)}`);
  const handler = (payload: { new: Record<string, unknown> }) => {
    const row = payload.new as unknown as GomokuMatchRow;
    if (!row?.id) {
      return;
    }
    onMatchChange(normalizeGomokuMatchRow(row));
  };

  channel
    .on("postgres_changes", { event: "*", schema: "public", table: "gomoku_matches", filter: `host_user_id=eq.${userId}` }, handler)
    .on("postgres_changes", { event: "*", schema: "public", table: "gomoku_matches", filter: `guest_user_id=eq.${userId}` }, handler)
    .subscribe();

  return channel;
}

export async function removeMatchChannel(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
