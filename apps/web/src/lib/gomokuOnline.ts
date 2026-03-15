import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  acceptMatch,
  applyMoveToMatch,
  cancelMatch,
  createPendingMatch,
  declineMatch,
  expireMatch,
  GOMOKU_ACTIVE_STATUSES,
  isPendingMatchExpired,
  normalizeBoardState,
  type GomokuMatch,
  type GomokuMatchStatus,
  type GomokuStone,
  type GomokuWinner
} from "./gomoku";

interface GomokuMatchRow {
  id: string;
  host_user_id: string;
  host_user_name: string;
  guest_user_id: string;
  guest_user_name: string;
  status: GomokuMatchStatus;
  board_state: unknown;
  moves_count: number;
  current_turn: GomokuStone;
  winner: GomokuWinner | null;
  revision: number;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  finished_at: string | null;
  expires_at: string | null;
}

export function normalizeGomokuMatchRow(row: GomokuMatchRow): GomokuMatch {
  return {
    id: row.id,
    hostUserId: row.host_user_id,
    hostUserName: row.host_user_name,
    guestUserId: row.guest_user_id,
    guestUserName: row.guest_user_name,
    status: row.status,
    boardState: normalizeBoardState(row.board_state),
    movesCount: Number(row.moves_count) || 0,
    currentTurn: row.current_turn === "white" ? "white" : "black",
    winner: row.winner ?? null,
    revision: Number(row.revision) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    finishedAt: row.finished_at,
    expiresAt: row.expires_at
  };
}

function matchToUpdatePayload(match: GomokuMatch) {
  return {
    host_user_id: match.hostUserId,
    host_user_name: match.hostUserName,
    guest_user_id: match.guestUserId,
    guest_user_name: match.guestUserName,
    status: match.status,
    board_state: match.boardState,
    moves_count: match.movesCount,
    current_turn: match.currentTurn,
    winner: match.winner,
    revision: match.revision,
    accepted_at: match.acceptedAt,
    finished_at: match.finishedAt,
    expires_at: match.expiresAt
  };
}

function sortMatches(items: GomokuMatch[]) {
  return [...items].sort((a, b) => {
    const priority = (status: GomokuMatchStatus) => {
      if (status === "active") return 0;
      if (status === "pending") return 1;
      return 2;
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
        .update(matchToUpdatePayload(expiredMatch))
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

  return sortMatches(next.filter((match) => match.status === "pending" || match.status === "active"));
}

async function updateMatchWithRevision(current: GomokuMatch, next: GomokuMatch) {
  const { data, error } = await supabase
    .from("gomoku_matches")
    .update(matchToUpdatePayload(next))
    .eq("id", current.id)
    .eq("revision", current.revision)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
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
    .in("status", [...GOMOKU_ACTIVE_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
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
    throw existingError;
  }
  const duplicates = await refreshExpiredMatches(((existing as GomokuMatchRow[] | null) ?? []).map(normalizeGomokuMatchRow));
  if (duplicates.some((match) => match.status === "pending" || match.status === "active")) {
    throw new Error("你们之间已经有进行中的邀请或对局");
  }

  const match = createPendingMatch(params);
  const { data, error } = await supabase
    .from("gomoku_matches")
    .insert({
      id: match.id,
      host_user_id: match.hostUserId,
      host_user_name: match.hostUserName,
      guest_user_id: match.guestUserId,
      guest_user_name: match.guestUserName,
      status: match.status,
      board_state: match.boardState,
      moves_count: match.movesCount,
      current_turn: match.currentTurn,
      winner: match.winner,
      revision: match.revision,
      created_at: match.createdAt,
      updated_at: match.updatedAt,
      accepted_at: match.acceptedAt,
      finished_at: match.finishedAt,
      expires_at: match.expiresAt
    })
    .select("*")
    .single();

  if (error) {
    throw error;
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
