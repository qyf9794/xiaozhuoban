import { createId, nowIso } from "@xiaozhuoban/domain";

export const GUANDAN_INVITE_TTL_MS = 5 * 60 * 1000;
export const GUANDAN_ACTIVE_STATUSES = ["pending", "active"] as const;
export const GUANDAN_VISIBLE_STATUSES = ["pending", "active", "completed"] as const;
export const GUANDAN_PLAYER_COUNT = 4;
export const GUANDAN_START_LEVEL = 2;
export const GUANDAN_ACE_LEVEL = 14;

export type GuandanMatchStatus = "pending" | "active" | "declined" | "cancelled" | "completed" | "expired";
export type GuandanPhase = "lobby" | "tribute" | "playing" | "round_complete" | "match_complete";
export type GuandanSuit = "spades" | "hearts" | "clubs" | "diamonds" | "joker";
export type GuandanComboType =
  | "single"
  | "pair"
  | "triple"
  | "three_with_pair"
  | "pair_run"
  | "triple_run"
  | "straight"
  | "bomb"
  | "straight_flush"
  | "four_kings";
export type GuandanBombFamily = "ordinary" | "bomb4" | "bomb5" | "straight_flush" | "bomb6" | "bomb7" | "bomb8" | "four_kings";
export type GuandanTributeMode = "none" | "single" | "double" | "anti";
export type GuandanTributeRequirementStatus = "pending_tribute" | "pending_return" | "completed" | "returned_original";

export interface GuandanCard {
  id: string;
  deck: number;
  suit: GuandanSuit;
  rank: number;
  label: string;
}

export interface GuandanCombo {
  type: GuandanComboType;
  family: GuandanBombFamily;
  length: number;
  primaryRank: number;
  bombSize: number;
  display: string;
}

export interface GuandanPlayRecord {
  playerId: string;
  userName: string;
  cardIds: string[];
  cardLabels: string[];
  combo: GuandanCombo | null;
  passed: boolean;
  remainingCards: number;
  createdAt: string;
  text: string;
}

export interface GuandanPlayerState {
  userId: string;
  userName: string;
  seat: number;
  team: 0 | 1;
  hand: GuandanCard[];
  handCount: number;
  reportedCount: number | null;
  finished: boolean;
  finishOrder: number | null;
}

export interface GuandanTrick {
  leaderPlayerId: string;
  currentPlayerId: string;
  currentCombo: GuandanCombo | null;
  lastPlayPlayerId: string;
  passCount: number;
  plays: GuandanPlayRecord[];
}

export interface GuandanTributeRequirement {
  tributerId: string;
  receiverId: string;
  tributeCardId: string | null;
  returnCardId: string | null;
  status: GuandanTributeRequirementStatus;
}

export interface GuandanTributeState {
  mode: GuandanTributeMode;
  starterPlayerId: string;
  requirements: GuandanTributeRequirement[];
  antiTribute: boolean;
}

export interface GuandanRoundSummary {
  finishingOrder: string[];
  winnerTeam: 0 | 1 | null;
  advance: number;
  levelBefore: number;
  levelAfter: number;
  nextTributeMode: GuandanTributeMode;
  message: string;
}

export interface GuandanState {
  invites: Array<{ userId: string; userName: string; status: "pending" | "accepted" | "declined" }>;
  currentLevel: number;
  currentRound: number;
  players: GuandanPlayerState[];
  currentTurnPlayerId: string;
  roundStarterPlayerId: string;
  currentTrick: GuandanTrick;
  finishingOrder: string[];
  tributeState: GuandanTributeState;
  lastRoundSummary: GuandanRoundSummary | null;
  lastEvent: string;
  eventLog: string[];
}

export interface GuandanMatch {
  id: string;
  hostUserId: string;
  hostUserName: string;
  participantIds: string[];
  status: GuandanMatchStatus;
  phase: GuandanPhase;
  state: GuandanState;
  revision: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
}

const SUIT_LABEL: Record<GuandanSuit, string> = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
  joker: ""
};

const NON_JOKER_SUITS: GuandanSuit[] = ["spades", "hearts", "clubs", "diamonds"];

function rankLabel(rank: number) {
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  if (rank === 15) return "小王";
  if (rank === 16) return "大王";
  return String(rank);
}

function buildDeck(random = Math.random) {
  const cards: GuandanCard[] = [];
  for (let deck = 0; deck < 2; deck += 1) {
    NON_JOKER_SUITS.forEach((suit) => {
      for (let rank = 2; rank <= 14; rank += 1) {
        cards.push({
          id: `gd_${deck}_${suit}_${rank}`,
          deck,
          suit,
          rank,
          label: `${SUIT_LABEL[suit]}${rankLabel(rank)}`
        });
      }
    });
    cards.push({ id: `gd_${deck}_joker_15`, deck, suit: "joker", rank: 15, label: "小王" });
    cards.push({ id: `gd_${deck}_joker_16`, deck, suit: "joker", rank: 16, label: "大王" });
  }
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
}

function isFiniteTimestamp(value: string | null | undefined) {
  if (!value) return false;
  return Number.isFinite(Date.parse(value));
}

function clampLevel(value: number) {
  if (!Number.isFinite(value)) return GUANDAN_START_LEVEL;
  return Math.min(GUANDAN_ACE_LEVEL, Math.max(GUANDAN_START_LEVEL, Math.round(value)));
}

function nextSeat(seat: number) {
  return (seat + 1) % GUANDAN_PLAYER_COUNT;
}

function previousSeat(seat: number) {
  return (seat + GUANDAN_PLAYER_COUNT - 1) % GUANDAN_PLAYER_COUNT;
}

function teamForSeat(seat: number): 0 | 1 {
  return seat % 2 === 0 ? 0 : 1;
}

function partnerSeat(seat: number) {
  return (seat + 2) % GUANDAN_PLAYER_COUNT;
}

function cardSortWeight(card: GuandanCard, currentLevel: number) {
  if (card.rank === 16) return 400;
  if (card.rank === 15) return 390;
  if (card.rank === currentLevel) return 300;
  return 100 + card.rank;
}

function compareCardsDesc(left: GuandanCard, right: GuandanCard, currentLevel: number) {
  const weightDiff = cardSortWeight(right, currentLevel) - cardSortWeight(left, currentLevel);
  if (weightDiff !== 0) return weightDiff;
  const suitWeight = (suit: GuandanSuit) => {
    if (suit === "joker") return 5;
    if (suit === "spades") return 4;
    if (suit === "hearts") return 3;
    if (suit === "clubs") return 2;
    return 1;
  };
  return suitWeight(right.suit) - suitWeight(left.suit);
}

export function sortHand(cards: GuandanCard[], currentLevel: number) {
  return [...cards].sort((left, right) => compareCardsDesc(left, right, currentLevel));
}

function cloneCard(card: GuandanCard): GuandanCard {
  return { ...card };
}

function clonePlayer(player: GuandanPlayerState): GuandanPlayerState {
  return {
    ...player,
    hand: player.hand.map(cloneCard)
  };
}

function cloneTrick(trick: GuandanTrick): GuandanTrick {
  return {
    ...trick,
    currentCombo: trick.currentCombo ? { ...trick.currentCombo } : null,
    plays: trick.plays.map((play) => ({
      ...play,
      cardIds: [...play.cardIds],
      cardLabels: [...play.cardLabels],
      combo: play.combo ? { ...play.combo } : null
    }))
  };
}

function cloneTributeState(tributeState: GuandanTributeState): GuandanTributeState {
  return {
    ...tributeState,
    requirements: tributeState.requirements.map((item) => ({ ...item }))
  };
}

function cloneState(state: GuandanState): GuandanState {
  return {
    invites: state.invites.map((invite) => ({ ...invite })),
    currentLevel: state.currentLevel,
    currentRound: state.currentRound,
    players: state.players.map(clonePlayer),
    currentTurnPlayerId: state.currentTurnPlayerId,
    roundStarterPlayerId: state.roundStarterPlayerId,
    currentTrick: cloneTrick(state.currentTrick),
    finishingOrder: [...state.finishingOrder],
    tributeState: cloneTributeState(state.tributeState),
    lastRoundSummary: state.lastRoundSummary ? { ...state.lastRoundSummary, finishingOrder: [...state.lastRoundSummary.finishingOrder] } : null,
    lastEvent: state.lastEvent,
    eventLog: [...state.eventLog]
  };
}

function logEvent(state: GuandanState, text: string) {
  state.lastEvent = text;
  state.eventLog = [text, ...state.eventLog].slice(0, 24);
}

function createLobbyState(invites: GuandanState["invites"]): GuandanState {
  return {
    invites,
    currentLevel: GUANDAN_START_LEVEL,
    currentRound: 0,
    players: [],
    currentTurnPlayerId: "",
    roundStarterPlayerId: "",
    currentTrick: {
      leaderPlayerId: "",
      currentPlayerId: "",
      currentCombo: null,
      lastPlayPlayerId: "",
      passCount: 0,
      plays: []
    },
    finishingOrder: [],
    tributeState: {
      mode: "none",
      starterPlayerId: "",
      requirements: [],
      antiTribute: false
    },
    lastRoundSummary: null,
    lastEvent: "等待 4 人房间凑齐",
    eventLog: ["等待 4 人房间凑齐"]
  };
}

function createPlayers(participants: Array<{ userId: string; userName: string }>, deck: GuandanCard[], currentLevel: number) {
  return participants.map((participant, seat) => ({
    userId: participant.userId,
    userName: participant.userName,
    seat,
    team: teamForSeat(seat),
    hand: sortHand(deck.slice(seat * 27, seat * 27 + 27), currentLevel),
    handCount: 27,
    reportedCount: null,
    finished: false,
    finishOrder: null
  })) as GuandanPlayerState[];
}

function currentPlayer(state: GuandanState) {
  return state.players.find((player) => player.userId === state.currentTurnPlayerId) ?? null;
}

function getPlayer(state: GuandanState, userId: string) {
  return state.players.find((player) => player.userId === userId) ?? null;
}

function getPlayerBySeat(state: GuandanState, seat: number) {
  return state.players.find((player) => player.seat === seat) ?? null;
}

function getActivePlayers(state: GuandanState) {
  return state.players.filter((player) => !player.finished && player.handCount > 0);
}

function normalizeInvites(value: unknown): GuandanState["invites"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const userId = typeof raw.userId === "string" ? raw.userId : "";
      const userName = typeof raw.userName === "string" ? raw.userName : "";
      const status = raw.status === "accepted" || raw.status === "declined" ? raw.status : "pending";
      if (!userId || !userName) return null;
      return { userId, userName, status };
    })
    .filter(Boolean) as GuandanState["invites"];
}

function normalizeCard(raw: unknown): GuandanCard | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "";
  const suit = value.suit;
  const rank = Number(value.rank);
  const label = typeof value.label === "string" ? value.label : "";
  const deck = Number(value.deck);
  if (!id || !Number.isFinite(rank) || !Number.isFinite(deck)) return null;
  if (suit !== "spades" && suit !== "hearts" && suit !== "clubs" && suit !== "diamonds" && suit !== "joker") return null;
  return { id, suit, rank, label, deck };
}

function normalizePlayers(value: unknown, currentLevel: number): GuandanPlayerState[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const userId = typeof raw.userId === "string" ? raw.userId : "";
      const userName = typeof raw.userName === "string" ? raw.userName : "";
      const seat = Number(raw.seat);
      if (!userId || !userName || !Number.isFinite(seat)) return null;
      const hand = Array.isArray(raw.hand) ? raw.hand.map(normalizeCard).filter(Boolean) as GuandanCard[] : [];
      return {
        userId,
        userName,
        seat,
        team: teamForSeat(seat),
        hand: sortHand(hand, currentLevel),
        handCount: Number(raw.handCount) || hand.length,
        reportedCount: typeof raw.reportedCount === "number" ? raw.reportedCount : null,
        finished: raw.finished === true,
        finishOrder: typeof raw.finishOrder === "number" ? raw.finishOrder : null
      } satisfies GuandanPlayerState;
    })
    .filter(Boolean) as GuandanPlayerState[];
}

function normalizeTrick(value: unknown): GuandanTrick {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const comboRaw = raw.currentCombo && typeof raw.currentCombo === "object" ? (raw.currentCombo as Record<string, unknown>) : null;
  const currentCombo = comboRaw
    ? {
        type: comboRaw.type as GuandanComboType,
        family: comboRaw.family as GuandanBombFamily,
        length: Number(comboRaw.length) || 0,
        primaryRank: Number(comboRaw.primaryRank) || 0,
        bombSize: Number(comboRaw.bombSize) || 0,
        display: typeof comboRaw.display === "string" ? comboRaw.display : ""
      }
    : null;
  const plays = Array.isArray(raw.plays)
    ? raw.plays
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const play = item as Record<string, unknown>;
          return {
            playerId: typeof play.playerId === "string" ? play.playerId : "",
            userName: typeof play.userName === "string" ? play.userName : "",
            cardIds: Array.isArray(play.cardIds) ? play.cardIds.filter((entry) => typeof entry === "string") as string[] : [],
            cardLabels: Array.isArray(play.cardLabels)
              ? (play.cardLabels.filter((entry) => typeof entry === "string") as string[])
              : [],
            combo: play.combo && typeof play.combo === "object"
              ? {
                  type: (play.combo as Record<string, unknown>).type as GuandanComboType,
                  family: (play.combo as Record<string, unknown>).family as GuandanBombFamily,
                  length: Number((play.combo as Record<string, unknown>).length) || 0,
                  primaryRank: Number((play.combo as Record<string, unknown>).primaryRank) || 0,
                  bombSize: Number((play.combo as Record<string, unknown>).bombSize) || 0,
                  display: typeof (play.combo as Record<string, unknown>).display === "string"
                    ? ((play.combo as Record<string, unknown>).display as string)
                    : ""
                }
              : null,
            passed: play.passed === true,
            remainingCards: Number(play.remainingCards) || 0,
            createdAt: typeof play.createdAt === "string" ? play.createdAt : "",
            text: typeof play.text === "string" ? play.text : ""
          } satisfies GuandanPlayRecord;
        })
        .filter(Boolean) as GuandanPlayRecord[]
    : [];
  return {
    leaderPlayerId: typeof raw.leaderPlayerId === "string" ? raw.leaderPlayerId : "",
    currentPlayerId: typeof raw.currentPlayerId === "string" ? raw.currentPlayerId : "",
    currentCombo,
    lastPlayPlayerId: typeof raw.lastPlayPlayerId === "string" ? raw.lastPlayPlayerId : "",
    passCount: Number(raw.passCount) || 0,
    plays
  };
}

function normalizeTributeState(value: unknown): GuandanTributeState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const mode = raw.mode === "single" || raw.mode === "double" || raw.mode === "anti" ? raw.mode : "none";
  const requirements = Array.isArray(raw.requirements)
    ? raw.requirements
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const requirement = item as Record<string, unknown>;
          const tributerId = typeof requirement.tributerId === "string" ? requirement.tributerId : "";
          const receiverId = typeof requirement.receiverId === "string" ? requirement.receiverId : "";
          const tributeCardId = typeof requirement.tributeCardId === "string" ? requirement.tributeCardId : null;
          const returnCardId = typeof requirement.returnCardId === "string" ? requirement.returnCardId : null;
          const status =
            requirement.status === "pending_tribute" ||
            requirement.status === "pending_return" ||
            requirement.status === "completed" ||
            requirement.status === "returned_original"
              ? requirement.status
              : "pending_tribute";
          if (!tributerId || !receiverId) return null;
          return { tributerId, receiverId, tributeCardId, returnCardId, status } satisfies GuandanTributeRequirement;
        })
        .filter(Boolean) as GuandanTributeRequirement[]
    : [];
  return {
    mode,
    starterPlayerId: typeof raw.starterPlayerId === "string" ? raw.starterPlayerId : "",
    requirements,
    antiTribute: raw.antiTribute === true
  };
}

export function normalizeGuandanState(value: unknown): GuandanState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const currentLevel = clampLevel(Number(raw.currentLevel) || GUANDAN_START_LEVEL);
  return {
    invites: normalizeInvites(raw.invites),
    currentLevel,
    currentRound: Number(raw.currentRound) || 0,
    players: normalizePlayers(raw.players, currentLevel),
    currentTurnPlayerId: typeof raw.currentTurnPlayerId === "string" ? raw.currentTurnPlayerId : "",
    roundStarterPlayerId: typeof raw.roundStarterPlayerId === "string" ? raw.roundStarterPlayerId : "",
    currentTrick: normalizeTrick(raw.currentTrick),
    finishingOrder: Array.isArray(raw.finishingOrder) ? raw.finishingOrder.filter((item) => typeof item === "string") as string[] : [],
    tributeState: normalizeTributeState(raw.tributeState),
    lastRoundSummary:
      raw.lastRoundSummary && typeof raw.lastRoundSummary === "object"
        ? {
            finishingOrder: Array.isArray((raw.lastRoundSummary as Record<string, unknown>).finishingOrder)
              ? ((raw.lastRoundSummary as Record<string, unknown>).finishingOrder as unknown[]).filter((item) => typeof item === "string") as string[]
              : [],
            winnerTeam:
              (raw.lastRoundSummary as Record<string, unknown>).winnerTeam === 0 || (raw.lastRoundSummary as Record<string, unknown>).winnerTeam === 1
                ? ((raw.lastRoundSummary as Record<string, unknown>).winnerTeam as 0 | 1)
                : null,
            advance: Number((raw.lastRoundSummary as Record<string, unknown>).advance) || 0,
            levelBefore: clampLevel(Number((raw.lastRoundSummary as Record<string, unknown>).levelBefore) || currentLevel),
            levelAfter: clampLevel(Number((raw.lastRoundSummary as Record<string, unknown>).levelAfter) || currentLevel),
            nextTributeMode:
              (raw.lastRoundSummary as Record<string, unknown>).nextTributeMode === "single" ||
              (raw.lastRoundSummary as Record<string, unknown>).nextTributeMode === "double" ||
              (raw.lastRoundSummary as Record<string, unknown>).nextTributeMode === "anti"
                ? ((raw.lastRoundSummary as Record<string, unknown>).nextTributeMode as GuandanTributeMode)
                : "none",
            message: typeof (raw.lastRoundSummary as Record<string, unknown>).message === "string"
              ? ((raw.lastRoundSummary as Record<string, unknown>).message as string)
              : ""
          }
        : null,
    lastEvent: typeof raw.lastEvent === "string" ? raw.lastEvent : "",
    eventLog: Array.isArray(raw.eventLog) ? raw.eventLog.filter((item) => typeof item === "string") as string[] : []
  };
}

function normalizeParticipants(userIds: string[]) {
  return [...new Set(userIds.filter(Boolean))];
}

function withUpdatedMatch(match: GuandanMatch, patch: Partial<GuandanMatch>, updatedAt = nowIso()): GuandanMatch {
  return {
    ...match,
    ...patch,
    revision: patch.revision ?? match.revision + 1,
    updatedAt
  };
}

function withState(match: GuandanMatch, state: GuandanState, patch: Partial<GuandanMatch>, updatedAt = nowIso()) {
  return withUpdatedMatch(match, { ...patch, state }, updatedAt);
}

function ensurePendingMatch(match: GuandanMatch) {
  if (match.status !== "pending") {
    throw new Error("当前房间不是待开始状态");
  }
}

function ensureHost(match: GuandanMatch, hostUserId: string) {
  if (match.hostUserId !== hostUserId) {
    throw new Error("只有房主可以执行此操作");
  }
}

function ensureParticipant(match: GuandanMatch, userId: string) {
  if (!match.participantIds.includes(userId)) {
    throw new Error("只有房间内玩家可以执行此操作");
  }
}

function ensureActiveMatch(match: GuandanMatch) {
  if (match.status !== "active") {
    throw new Error("当前房间未在进行中");
  }
}

export function createPendingMatch(params: {
  hostUserId: string;
  hostUserName: string;
  invitees: Array<{ userId: string; userName: string }>;
  createdAt?: string;
  expiresAt?: string;
}) {
  const hostUserId = params.hostUserId.trim();
  const hostUserName = params.hostUserName.trim();
  if (!hostUserId || !hostUserName) {
    throw new Error("房主信息无效");
  }

  const invitees = normalizeParticipants(params.invitees.map((item) => item.userId)).map((userId) => {
    const matched = params.invitees.find((item) => item.userId === userId);
    return { userId, userName: matched?.userName?.trim() ?? "" };
  });

  if (invitees.length !== 3) {
    throw new Error("请邀请恰好 3 名在线用户");
  }
  if (invitees.some((entry) => !entry.userName || entry.userId === hostUserId)) {
    throw new Error("邀请列表无效");
  }

  const createdAt = params.createdAt ?? nowIso();
  const expiresAt = params.expiresAt ?? new Date(Date.parse(createdAt) + GUANDAN_INVITE_TTL_MS).toISOString();
  const invites = invitees.map((entry) => ({
    userId: entry.userId,
    userName: entry.userName,
    status: "pending" as const
  }));

  return {
    id: createId("guandan"),
    hostUserId,
    hostUserName,
    participantIds: [hostUserId, ...invitees.map((entry) => entry.userId)],
    status: "pending" as const,
    phase: "lobby" as const,
    state: createLobbyState(invites),
    revision: 0,
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    finishedAt: null,
    expiresAt
  } satisfies GuandanMatch;
}

export function isPendingMatchExpired(match: GuandanMatch, currentTime = nowIso()) {
  return match.status === "pending" && isFiniteTimestamp(match.expiresAt) && Date.parse(currentTime) >= Date.parse(match.expiresAt!);
}

export function expireMatch(match: GuandanMatch, expiredAt = nowIso()) {
  ensurePendingMatch(match);
  const state = cloneState(match.state);
  logEvent(state, "邀请已过期");
  return withState(match, state, { status: "expired", phase: "match_complete", finishedAt: expiredAt }, expiredAt);
}

export function acceptMatch(match: GuandanMatch, userId: string, acceptedAt = nowIso()) {
  ensurePendingMatch(match);
  if (isPendingMatchExpired(match, acceptedAt)) {
    throw new Error("邀请已过期");
  }
  const state = cloneState(match.state);
  const invite = state.invites.find((entry) => entry.userId === userId);
  if (!invite) {
    throw new Error("只有被邀请玩家可以接受");
  }
  if (invite.status !== "pending") {
    throw new Error("邀请状态已更新");
  }
  invite.status = "accepted";
  logEvent(state, `${invite.userName} 已接受邀请`);
  return withState(match, state, {}, acceptedAt);
}

export function declineMatch(match: GuandanMatch, userId: string, declinedAt = nowIso()) {
  ensurePendingMatch(match);
  const state = cloneState(match.state);
  const invite = state.invites.find((entry) => entry.userId === userId);
  if (!invite) {
    throw new Error("只有被邀请玩家可以拒绝");
  }
  if (invite.status !== "pending") {
    throw new Error("邀请状态已更新");
  }
  invite.status = "declined";
  logEvent(state, `${invite.userName} 已拒绝邀请`);
  return withState(match, state, { status: "declined", phase: "match_complete", finishedAt: declinedAt }, declinedAt);
}

export function cancelMatch(match: GuandanMatch, hostUserId: string, cancelledAt = nowIso()) {
  ensurePendingMatch(match);
  ensureHost(match, hostUserId);
  const state = cloneState(match.state);
  logEvent(state, "房主取消了房间");
  return withState(match, state, { status: "cancelled", phase: "match_complete", finishedAt: cancelledAt }, cancelledAt);
}

function createEmptyTrick(starterPlayerId: string): GuandanTrick {
  return {
    leaderPlayerId: starterPlayerId,
    currentPlayerId: starterPlayerId,
    currentCombo: null,
    lastPlayPlayerId: starterPlayerId,
    passCount: 0,
    plays: []
  };
}

function beginRound(
  participants: Array<{ userId: string; userName: string }>,
  currentLevel: number,
  starterPlayerId: string,
  currentRound: number,
  random = Math.random
) {
  const deck = buildDeck(random);
  const players = createPlayers(participants, deck, currentLevel);
  return {
    players,
    currentTurnPlayerId: starterPlayerId,
    roundStarterPlayerId: starterPlayerId,
    currentTrick: createEmptyTrick(starterPlayerId),
    finishingOrder: []
  };
}

export function startMatch(match: GuandanMatch, hostUserId: string, startedAt = nowIso(), random = Math.random) {
  ensurePendingMatch(match);
  ensureHost(match, hostUserId);
  if (isPendingMatchExpired(match, startedAt)) {
    throw new Error("邀请已过期");
  }
  if (match.state.invites.some((invite) => invite.status !== "accepted")) {
    throw new Error("需要 4 名玩家全部接受后才能开始");
  }
  const participants = [
    { userId: match.hostUserId, userName: match.hostUserName },
    ...match.state.invites.map((invite) => ({ userId: invite.userId, userName: invite.userName }))
  ];
  const round = beginRound(participants, GUANDAN_START_LEVEL, match.hostUserId, 1, random);
  const state: GuandanState = {
    invites: cloneState(match.state).invites,
    currentLevel: GUANDAN_START_LEVEL,
    currentRound: 1,
    players: round.players,
    currentTurnPlayerId: round.currentTurnPlayerId,
    roundStarterPlayerId: round.roundStarterPlayerId,
    currentTrick: round.currentTrick,
    finishingOrder: [],
    tributeState: { mode: "none", starterPlayerId: match.hostUserId, requirements: [], antiTribute: false },
    lastRoundSummary: null,
    lastEvent: `${match.hostUserName} 开始了第 1 局，当前打 ${rankLabel(GUANDAN_START_LEVEL)}`,
    eventLog: [`${match.hostUserName} 开始了第 1 局，当前打 ${rankLabel(GUANDAN_START_LEVEL)}`]
  };
  return withUpdatedMatch(
    match,
    {
      status: "active",
      phase: "playing",
      state,
      startedAt,
      expiresAt: null,
      participantIds: participants.map((participant) => participant.userId)
    },
    startedAt
  );
}

export function restartMatch(match: GuandanMatch, hostUserId: string, restartedAt = nowIso(), random = Math.random) {
  ensureHost(match, hostUserId);
  const knownPlayers = new Map<string, string>([[match.hostUserId, match.hostUserName]]);
  match.state.invites.forEach((invite) => {
    if (invite.status === "accepted") {
      knownPlayers.set(invite.userId, invite.userName);
    }
  });
  if (match.participantIds.length !== 4) {
    throw new Error("当前房间人数不足，无法重新开始");
  }
  const participants = match.participantIds.map((userId) => ({
    userId,
    userName: knownPlayers.get(userId) ?? ""
  }));
  if (participants.some((entry) => !entry.userName)) {
    throw new Error("房间玩家信息不完整");
  }
  const round = beginRound(participants, GUANDAN_START_LEVEL, match.hostUserId, 1, random);
  const state: GuandanState = {
    invites: match.state.invites.map((invite) => ({ ...invite, status: "accepted" })),
    currentLevel: GUANDAN_START_LEVEL,
    currentRound: 1,
    players: round.players,
    currentTurnPlayerId: round.currentTurnPlayerId,
    roundStarterPlayerId: round.roundStarterPlayerId,
    currentTrick: round.currentTrick,
    finishingOrder: [],
    tributeState: { mode: "none", starterPlayerId: match.hostUserId, requirements: [], antiTribute: false },
    lastRoundSummary: null,
    lastEvent: `${match.hostUserName} 重新开始了房间，当前打 ${rankLabel(GUANDAN_START_LEVEL)}`,
    eventLog: [`${match.hostUserName} 重新开始了房间，当前打 ${rankLabel(GUANDAN_START_LEVEL)}`]
  };
  return withUpdatedMatch(
    match,
    {
      status: "active",
      phase: "playing",
      state,
      startedAt: restartedAt,
      finishedAt: null,
      expiresAt: null
    },
    restartedAt
  );
}

function isWildcard(card: GuandanCard, currentLevel: number) {
  return card.suit === "hearts" && card.rank === currentLevel;
}

function isLevelCard(card: GuandanCard, currentLevel: number) {
  return card.rank === currentLevel && card.rank < 15;
}

function canWildcardTargetRank(rank: number) {
  return rank >= 2 && rank <= 14;
}

function rawCountByRank(cards: GuandanCard[]) {
  const map = new Map<number, GuandanCard[]>();
  cards.forEach((card) => {
    const current = map.get(card.rank) ?? [];
    current.push(card);
    map.set(card.rank, current);
  });
  return map;
}

function nonWildCards(cards: GuandanCard[], currentLevel: number) {
  return cards.filter((card) => !isWildcard(card, currentLevel));
}

function wildcardCount(cards: GuandanCard[], currentLevel: number) {
  return cards.filter((card) => isWildcard(card, currentLevel)).length;
}

function canMakeCount(cards: GuandanCard[], currentLevel: number, rank: number, count: number, allowWildcard = true) {
  const fixed = nonWildCards(cards, currentLevel).filter((card) => card.rank === rank).length;
  const wild = allowWildcard && canWildcardTargetRank(rank) ? wildcardCount(cards, currentLevel) : 0;
  return fixed + wild >= count;
}

function straightRanks(currentLevel: number) {
  return Array.from({ length: 13 }, (_, index) => index + 2).filter((rank) => rank !== currentLevel);
}

function canMakeStraight(cards: GuandanCard[], currentLevel: number, targetRanks: number[]) {
  const fixed = nonWildCards(cards, currentLevel);
  if (fixed.some((card) => card.suit === "joker" || card.rank === currentLevel)) {
    return false;
  }
  const wild = wildcardCount(cards, currentLevel);
  let usedWild = 0;
  const byRank = rawCountByRank(fixed);
  for (const rank of targetRanks) {
    const count = byRank.get(rank)?.length ?? 0;
    if (count >= 1) continue;
    usedWild += 1;
  }
  return usedWild <= wild;
}

function canMakeStraightFlush(cards: GuandanCard[], currentLevel: number, targetRanks: number[]) {
  const fixed = nonWildCards(cards, currentLevel);
  if (fixed.some((card) => card.suit === "joker" || card.rank === currentLevel)) {
    return false;
  }
  const wild = wildcardCount(cards, currentLevel);
  for (const suit of NON_JOKER_SUITS) {
    let usedWild = 0;
    let okay = true;
    for (const rank of targetRanks) {
      const matched = fixed.some((card) => card.suit === suit && card.rank === rank);
      if (!matched) {
        usedWild += 1;
        if (usedWild > wild) {
          okay = false;
          break;
        }
      }
    }
    if (okay) return true;
  }
  return false;
}

function detectPairLike(cards: GuandanCard[], currentLevel: number, count: number) {
  const fixed = nonWildCards(cards, currentLevel);
  const ranks = [...new Set(fixed.map((card) => card.rank).filter((rank) => rank !== 15 && rank !== 16))];
  if (fixed.every((card) => card.rank === 15) && count === 2) return 15;
  if (fixed.every((card) => card.rank === 16) && count === 2) return 16;
  if (fixed.every((card) => card.rank === 15) && count === 3) return 15;
  if (fixed.every((card) => card.rank === 16) && count === 3) return 16;
  for (const rank of ranks.sort((left, right) => right - left)) {
    if (canMakeCount(cards, currentLevel, rank, count)) return rank;
  }
  if (count <= 3 && wildcardCount(cards, currentLevel) >= count) {
    return currentLevel;
  }
  return null;
}

function comboDisplay(type: GuandanComboType, primaryRank: number, bombSize = 0) {
  if (type === "bomb") return `${bombSize}炸 ${rankLabel(primaryRank)}`;
  if (type === "straight_flush") return `同花顺 ${rankLabel(primaryRank)}`;
  if (type === "four_kings") return "四王炸";
  if (type === "single") return `单张 ${rankLabel(primaryRank)}`;
  if (type === "pair") return `对子 ${rankLabel(primaryRank)}`;
  if (type === "triple") return `三张 ${rankLabel(primaryRank)}`;
  if (type === "three_with_pair") return `三带二 ${rankLabel(primaryRank)}`;
  if (type === "pair_run") return `木板 ${rankLabel(primaryRank)}`;
  if (type === "triple_run") return `钢板 ${rankLabel(primaryRank)}`;
  return `顺子 ${rankLabel(primaryRank)}`;
}

export function detectCombo(cards: GuandanCard[], currentLevel: number): GuandanCombo | null {
  const length = cards.length;
  if (length === 0) return null;
  const wild = wildcardCount(cards, currentLevel);
  const fixed = nonWildCards(cards, currentLevel);
  const countByRank = rawCountByRank(fixed);
  const ranksDesc = [...countByRank.keys()].sort((left, right) => right - left);

  if (length === 4) {
    const smallJokers = fixed.filter((card) => card.rank === 15).length;
    const bigJokers = fixed.filter((card) => card.rank === 16).length;
    if (smallJokers === 2 && bigJokers === 2 && wild === 0) {
      return { type: "four_kings", family: "four_kings", length, primaryRank: 16, bombSize: 4, display: "四王炸" };
    }
  }

  if (length >= 4 && length <= 8) {
    for (const rank of [...ranksDesc, currentLevel].sort((left, right) => right - left)) {
      if ((rank === 15 || rank === 16) && wild > 0) continue;
      if (canMakeCount(cards, currentLevel, rank, length, rank !== 15 && rank !== 16)) {
        const family = length === 4 ? "bomb4" : length === 5 ? "bomb5" : length === 6 ? "bomb6" : length === 7 ? "bomb7" : "bomb8";
        return { type: "bomb", family, length, primaryRank: rank, bombSize: length, display: comboDisplay("bomb", rank, length) };
      }
    }
  }

  if (length === 5) {
    const straightOptions = straightRanks(currentLevel);
    for (let start = straightOptions.length - 5; start >= 0; start -= 1) {
      const target = straightOptions.slice(start, start + 5);
      if (canMakeStraightFlush(cards, currentLevel, target)) {
        return {
          type: "straight_flush",
          family: "straight_flush",
          length,
          primaryRank: target[target.length - 1]!,
          bombSize: 5,
          display: comboDisplay("straight_flush", target[target.length - 1]!)
        };
      }
    }
  }

  if (length === 1) {
    const card = cards[0]!;
    const primaryRank = card.rank === currentLevel ? currentLevel : card.rank;
    return { type: "single", family: "ordinary", length, primaryRank, bombSize: 0, display: comboDisplay("single", primaryRank) };
  }

  if (length === 2) {
    const rank = detectPairLike(cards, currentLevel, 2);
    if (rank !== null) {
      return { type: "pair", family: "ordinary", length, primaryRank: rank, bombSize: 0, display: comboDisplay("pair", rank) };
    }
    return null;
  }

  if (length === 3) {
    const rank = detectPairLike(cards, currentLevel, 3);
    if (rank !== null) {
      return { type: "triple", family: "ordinary", length, primaryRank: rank, bombSize: 0, display: comboDisplay("triple", rank) };
    }
    return null;
  }

  if (length === 5) {
    for (const tripleRank of [...ranksDesc, currentLevel].sort((left, right) => right - left)) {
      if ((tripleRank === 15 || tripleRank === 16) && wild > 0) continue;
      if (!canMakeCount(cards, currentLevel, tripleRank, 3, tripleRank !== 15 && tripleRank !== 16)) continue;
      for (const pairRank of [...ranksDesc, currentLevel].sort((left, right) => right - left)) {
        if (pairRank === tripleRank) continue;
        if ((pairRank === 15 || pairRank === 16) && wild > 0) continue;
        const remaining = fixed.filter((card) => card.rank !== tripleRank);
        const remainingWild = length - remaining.length;
        if (
          canMakeCount(
            [
              ...remaining,
              ...Array.from({ length: remainingWild }, (_, index) => ({
                id: `w${index}`,
                suit: "hearts" as const,
                rank: currentLevel,
                label: "",
                deck: 0
              }))
            ],
            currentLevel,
            pairRank,
            2,
            pairRank !== 15 && pairRank !== 16
          )
        ) {
          return {
            type: "three_with_pair",
            family: "ordinary",
            length,
            primaryRank: tripleRank,
            bombSize: 0,
            display: comboDisplay("three_with_pair", tripleRank)
          };
        }
      }
    }

    const straightOptions = straightRanks(currentLevel);
    for (let start = straightOptions.length - 5; start >= 0; start -= 1) {
      const target = straightOptions.slice(start, start + 5);
      if (canMakeStraight(cards, currentLevel, target)) {
        return {
          type: "straight",
          family: "ordinary",
          length,
          primaryRank: target[target.length - 1]!,
          bombSize: 0,
          display: comboDisplay("straight", target[target.length - 1]!)
        };
      }
    }
  }

  if (length === 6) {
    const allowed = straightRanks(currentLevel);
    for (let start = allowed.length - 3; start >= 0; start -= 1) {
      const target = allowed.slice(start, start + 3);
      let missing = 0;
      const fixedCounts = rawCountByRank(nonWildCards(cards, currentLevel));
      target.forEach((rank) => {
        const count = fixedCounts.get(rank)?.length ?? 0;
        if (count < 2) missing += 2 - count;
      });
      if (missing <= wild) {
        return {
          type: "pair_run",
          family: "ordinary",
          length,
          primaryRank: target[target.length - 1]!,
          bombSize: 0,
          display: comboDisplay("pair_run", target[target.length - 1]!)
        };
      }
    }

    for (let start = allowed.length - 2; start >= 0; start -= 1) {
      const target = allowed.slice(start, start + 2);
      let missing = 0;
      const fixedCounts = rawCountByRank(nonWildCards(cards, currentLevel));
      target.forEach((rank) => {
        const count = fixedCounts.get(rank)?.length ?? 0;
        if (count < 3) missing += 3 - count;
      });
      if (missing <= wild) {
        return {
          type: "triple_run",
          family: "ordinary",
          length,
          primaryRank: target[target.length - 1]!,
          bombSize: 0,
          display: comboDisplay("triple_run", target[target.length - 1]!)
        };
      }
    }
  }

  return null;
}

function familyWeight(combo: GuandanCombo) {
  if (combo.family === "ordinary") return 0;
  if (combo.family === "bomb4") return 1;
  if (combo.family === "bomb5") return 2;
  if (combo.family === "straight_flush") return 3;
  if (combo.family === "bomb6") return 4;
  if (combo.family === "bomb7") return 5;
  if (combo.family === "bomb8") return 6;
  return 7;
}

export function canBeatCombo(challenger: GuandanCombo, defender: GuandanCombo | null) {
  if (!defender) return true;
  const challengerWeight = familyWeight(challenger);
  const defenderWeight = familyWeight(defender);
  if (challengerWeight !== defenderWeight) {
    return challengerWeight > defenderWeight;
  }
  if (challengerWeight > 0) {
    if (challenger.type === "four_kings" && defender.type === "four_kings") return false;
    if (challenger.bombSize !== defender.bombSize) {
      return challenger.bombSize > defender.bombSize;
    }
    return challenger.primaryRank > defender.primaryRank;
  }
  return challenger.type === defender.type && challenger.length === defender.length && challenger.primaryRank > defender.primaryRank;
}

function removeCardsFromHand(hand: GuandanCard[], cardIds: string[], currentLevel: number) {
  const next = [...hand];
  for (const cardId of cardIds) {
    const index = next.findIndex((card) => card.id === cardId);
    if (index < 0) {
      throw new Error("手牌与出牌选择不一致");
    }
    next.splice(index, 1);
  }
  return sortHand(next, currentLevel);
}

function rotateToNextActivePlayer(state: GuandanState, seat: number) {
  let cursor = seat;
  for (let index = 0; index < GUANDAN_PLAYER_COUNT; index += 1) {
    cursor = nextSeat(cursor);
    const player = getPlayerBySeat(state, cursor);
    if (player && !player.finished && player.handCount > 0) {
      return player.userId;
    }
  }
  return "";
}

function rotateToPreviousActivePlayer(state: GuandanState, seat: number) {
  let cursor = seat;
  for (let index = 0; index < GUANDAN_PLAYER_COUNT; index += 1) {
    cursor = previousSeat(cursor);
    const player = getPlayerBySeat(state, cursor);
    if (player && !player.finished && player.handCount > 0) {
      return player.userId;
    }
  }
  return "";
}

function updateReport(player: GuandanPlayerState, state: GuandanState) {
  if (player.handCount <= 10 && player.handCount >= 1 && player.reportedCount !== player.handCount) {
    player.reportedCount = player.handCount;
    logEvent(state, `${player.userName} 报 ${player.handCount}`);
  }
}

function determineAdvance(finishingOrderPlayers: GuandanPlayerState[]) {
  const first = finishingOrderPlayers[0];
  const second = finishingOrderPlayers[1];
  const third = finishingOrderPlayers[2];
  const fourth = finishingOrderPlayers[3];
  if (!first || !second || !third || !fourth) {
    return { winnerTeam: null, advance: 0, tributeMode: "none" as GuandanTributeMode };
  }
  if (first.team === second.team) {
    return { winnerTeam: first.team, advance: 3, tributeMode: "double" as GuandanTributeMode };
  }
  if (first.team === third.team) {
    return { winnerTeam: first.team, advance: 2, tributeMode: "single" as GuandanTributeMode };
  }
  return { winnerTeam: first.team, advance: 1, tributeMode: "none" as GuandanTributeMode };
}

function biggestTributeCandidates(hand: GuandanCard[], currentLevel: number) {
  const eligible = hand.filter((card) => !(card.suit === "hearts" && card.rank === currentLevel));
  if (eligible.length === 0) return [];
  const sorted = sortHand(eligible, currentLevel);
  const top = sorted[0]!;
  const topWeight = cardSortWeight(top, currentLevel);
  return sorted.filter((card) => cardSortWeight(card, currentLevel) === topWeight);
}

function canReturnCard(card: GuandanCard, currentLevel: number) {
  return card.rank <= 10 && card.rank !== currentLevel && card.rank < 15;
}

function countBigJokers(hand: GuandanCard[]) {
  return hand.filter((card) => card.rank === 16).length;
}

function createNextRound(
  match: GuandanMatch,
  state: GuandanState,
  starterPlayerId: string,
  tributeMode: GuandanTributeMode,
  restartedAt: string,
  random = Math.random
) {
  const participants = match.participantIds.map((userId) => {
    const player = getPlayer(match.state, userId);
    const invite = match.state.invites.find((item) => item.userId === userId);
    return {
      userId,
      userName: player?.userName ?? invite?.userName ?? (userId === match.hostUserId ? match.hostUserName : "")
    };
  });
  const round = beginRound(participants, state.currentLevel, starterPlayerId, state.currentRound + 1, random);
  state.currentRound += 1;
  state.players = round.players;
  state.currentTurnPlayerId = round.currentTurnPlayerId;
  state.roundStarterPlayerId = round.roundStarterPlayerId;
  state.currentTrick = round.currentTrick;
  state.finishingOrder = [];
  state.lastEvent = `第 ${state.currentRound} 局开始，当前打 ${rankLabel(state.currentLevel)}`;
  state.eventLog = [state.lastEvent, ...state.eventLog].slice(0, 24);

  if (tributeMode === "none") {
    state.tributeState = { mode: "none", starterPlayerId, requirements: [], antiTribute: false };
    return withState(match, state, { phase: "playing" }, restartedAt);
  }

  const summary = state.lastRoundSummary;
  if (!summary) {
    state.tributeState = { mode: "none", starterPlayerId, requirements: [], antiTribute: false };
    return withState(match, state, { phase: "playing" }, restartedAt);
  }

  const finishingPlayers = summary.finishingOrder.map((playerId) => getPlayer(state, playerId)).filter(Boolean) as GuandanPlayerState[];
  const previousPlayers = match.state.players;
  const first = previousPlayers.find((player) => player.userId === summary.finishingOrder[0])!;
  const second = previousPlayers.find((player) => player.userId === summary.finishingOrder[1])!;
  const third = previousPlayers.find((player) => player.userId === summary.finishingOrder[2])!;
  const fourth = previousPlayers.find((player) => player.userId === summary.finishingOrder[3])!;
  const nextPlayers = state.players;

  if (tributeMode === "single") {
    const tributer = nextPlayers.find((player) => player.userId === fourth.userId)!;
    const receiver = nextPlayers.find((player) => player.userId === first.userId)!;
    if (countBigJokers(tributer.hand) >= 2) {
      state.tributeState = { mode: "anti", starterPlayerId: first.userId, requirements: [], antiTribute: true };
      logEvent(state, `${tributer.userName} 持有双大王，抗贡成功`);
      state.currentTurnPlayerId = first.userId;
      state.roundStarterPlayerId = first.userId;
      state.currentTrick = createEmptyTrick(first.userId);
      return withState(match, state, { phase: "playing" }, restartedAt);
    }
    state.tributeState = {
      mode: "single",
      starterPlayerId: first.userId,
      antiTribute: false,
      requirements: [
        {
          tributerId: tributer.userId,
          receiverId: receiver.userId,
          tributeCardId: null,
          returnCardId: null,
          status: "pending_tribute"
        }
      ]
    };
    logEvent(state, `${tributer.userName} 向 ${receiver.userName} 进贡`);
    return withState(match, state, { phase: "tribute" }, restartedAt);
  }

  const tributerOne = nextPlayers.find((player) => player.userId === third.userId)!;
  const tributerTwo = nextPlayers.find((player) => player.userId === fourth.userId)!;
  const receiverOne = nextPlayers.find((player) => player.userId === first.userId)!;
  const receiverTwo = nextPlayers.find((player) => player.userId === second.userId)!;
  if (countBigJokers(tributerOne.hand) + countBigJokers(tributerTwo.hand) >= 2) {
    state.tributeState = { mode: "anti", starterPlayerId: first.userId, requirements: [], antiTribute: true };
    logEvent(state, `${tributerOne.userName} 与 ${tributerTwo.userName} 合计持有双大王，抗贡成功`);
    state.currentTurnPlayerId = first.userId;
    state.roundStarterPlayerId = first.userId;
    state.currentTrick = createEmptyTrick(first.userId);
    return withState(match, state, { phase: "playing" }, restartedAt);
  }
  state.tributeState = {
    mode: "double",
    starterPlayerId: first.userId,
    antiTribute: false,
    requirements: [
      {
        tributerId: tributerOne.userId,
        receiverId: receiverOne.userId,
        tributeCardId: null,
        returnCardId: null,
        status: "pending_tribute"
      },
      {
        tributerId: tributerTwo.userId,
        receiverId: receiverTwo.userId,
        tributeCardId: null,
        returnCardId: null,
        status: "pending_tribute"
      }
    ]
  };
  logEvent(state, `${tributerOne.userName} 与 ${tributerTwo.userName} 进入双贡阶段`);
  return withState(match, state, { phase: "tribute" }, restartedAt);
}

function maybeCompleteRound(match: GuandanMatch, state: GuandanState, completedAt: string, random = Math.random): GuandanMatch | null {
  if (state.finishingOrder.length < 4) return null;
  const finishingPlayers = state.finishingOrder.map((playerId) => getPlayer(state, playerId)).filter(Boolean) as GuandanPlayerState[];
  const result = determineAdvance(finishingPlayers);
  const levelBefore = state.currentLevel;
  let levelAfter = clampLevel(levelBefore + result.advance);
  let phase: GuandanPhase = "round_complete";
  let status: GuandanMatchStatus = "active";

  if (levelBefore === GUANDAN_ACE_LEVEL) {
    const partnerLast = finishingPlayers[3]?.team === finishingPlayers[0]?.team;
    if (!partnerLast) {
      phase = "match_complete";
      status = "completed";
      levelAfter = GUANDAN_ACE_LEVEL;
    } else {
      levelAfter = GUANDAN_ACE_LEVEL;
    }
  }
  if (levelBefore < GUANDAN_ACE_LEVEL && levelAfter > GUANDAN_ACE_LEVEL) {
    levelAfter = GUANDAN_ACE_LEVEL;
  }

  const summary: GuandanRoundSummary = {
    finishingOrder: [...state.finishingOrder],
    winnerTeam: result.winnerTeam,
    advance: result.advance,
    levelBefore,
    levelAfter,
    nextTributeMode: result.tributeMode,
    message:
      phase === "match_complete"
        ? `${finishingPlayers[0]?.userName ?? "胜方"} 所在队过 A 成功，整场结束`
        : `${finishingPlayers[0]?.userName ?? "胜方"} 所在队本轮升 ${result.advance} 级`
  };

  state.lastRoundSummary = summary;
  state.currentLevel = levelAfter;
  logEvent(state, summary.message);

  if (phase === "match_complete") {
    return withState(match, state, { phase, status, finishedAt: completedAt }, completedAt);
  }

  const first = finishingPlayers[0]!;
  const second = finishingPlayers[1]!;
  const starterPlayerId = result.tributeMode === "none" ? first.userId : first.userId;
  return createNextRound(match, state, starterPlayerId, result.tributeMode, completedAt, random);
}

export function submitPlay(
  match: GuandanMatch,
  params: { userId: string; cardIds: string[]; playedAt?: string; random?: () => number }
) {
  ensureActiveMatch(match);
  if (match.phase !== "playing") {
    throw new Error("当前阶段不可出牌");
  }
  ensureParticipant(match, params.userId);
  const state = cloneState(match.state);
  if (state.currentTurnPlayerId !== params.userId) {
    throw new Error("还没轮到你");
  }
  const player = getPlayer(state, params.userId);
  if (!player || player.finished) {
    throw new Error("当前玩家状态无效");
  }
  if (!Array.isArray(params.cardIds) || params.cardIds.length === 0) {
    throw new Error("请选择要出的牌");
  }
  const selectedCards = params.cardIds.map((cardId) => player.hand.find((card) => card.id === cardId)).filter(Boolean) as GuandanCard[];
  if (selectedCards.length !== params.cardIds.length) {
    throw new Error("所选牌不在当前手牌中");
  }
  const combo = detectCombo(selectedCards, state.currentLevel);
  if (!combo) {
    throw new Error("当前选牌不构成合法牌型");
  }
  if (!canBeatCombo(combo, state.currentTrick.currentCombo)) {
    throw new Error("当前出牌无法压过牌桌");
  }

  player.hand = removeCardsFromHand(player.hand, params.cardIds, state.currentLevel);
  player.handCount = player.hand.length;
  updateReport(player, state);

  state.currentTrick.currentCombo = combo;
  state.currentTrick.lastPlayPlayerId = player.userId;
  state.currentTrick.leaderPlayerId = player.userId;
  state.currentTrick.passCount = 0;
  state.currentTrick.plays.push({
    playerId: player.userId,
    userName: player.userName,
    cardIds: [...params.cardIds],
    cardLabels: selectedCards.map((card) => card.label),
    combo,
    passed: false,
    remainingCards: player.handCount,
    createdAt: params.playedAt ?? nowIso(),
    text: `${player.userName} 打出 ${combo.display}`
  });
  logEvent(state, `${player.userName} 打出 ${combo.display}`);

  if (player.handCount === 0) {
    player.finished = true;
    player.finishOrder = state.finishingOrder.length + 1;
    state.finishingOrder.push(player.userId);
    logEvent(state, `${player.userName} 率先出完，排名第 ${player.finishOrder}`);
    const remaining = state.players.filter((item) => !item.finished && item.handCount > 0);
    if (remaining.length === 1) {
      const last = remaining[0]!;
      last.finished = true;
      last.finishOrder = state.finishingOrder.length + 1;
      state.finishingOrder.push(last.userId);
      logEvent(state, `${last.userName} 成为末游`);
    }
  }

  const completed = maybeCompleteRound(match, state, params.playedAt ?? nowIso(), params.random);
  if (completed) {
    return completed;
  }

  const nextTurn = rotateToNextActivePlayer(state, player.seat);
  state.currentTurnPlayerId = nextTurn;
  state.currentTrick.currentPlayerId = nextTurn;
  return withState(match, state, {}, params.playedAt ?? nowIso());
}

export function passTurn(match: GuandanMatch, userId: string, passedAt = nowIso()) {
  ensureActiveMatch(match);
  if (match.phase !== "playing") {
    throw new Error("当前阶段不可不出");
  }
  ensureParticipant(match, userId);
  const state = cloneState(match.state);
  if (state.currentTurnPlayerId !== userId) {
    throw new Error("还没轮到你");
  }
  if (!state.currentTrick.currentCombo) {
    throw new Error("当前牌桌为空，不能不出");
  }
  const player = getPlayer(state, userId);
  if (!player || player.finished) {
    throw new Error("当前玩家状态无效");
  }
  state.currentTrick.passCount += 1;
  state.currentTrick.plays.push({
    playerId: player.userId,
    userName: player.userName,
    cardIds: [],
    cardLabels: [],
    combo: null,
    passed: true,
    remainingCards: player.handCount,
    createdAt: passedAt,
    text: `${player.userName} 选择不出`
  });
  logEvent(state, `${player.userName} 不出`);

  const activePlayers = getActivePlayers(state);
  const neededPasses = Math.max(0, activePlayers.length - 1);
  if (state.currentTrick.passCount >= neededPasses) {
    const leader = getPlayer(state, state.currentTrick.lastPlayPlayerId);
    const nextLead = leader && !leader.finished ? leader.userId : rotateToNextActivePlayer(state, player.seat);
    state.currentTurnPlayerId = nextLead;
    state.currentTrick = createEmptyTrick(nextLead);
    logEvent(state, "本轮其他玩家全部不出，牌桌清空");
    return withState(match, state, {}, passedAt);
  }

  const nextTurn = rotateToNextActivePlayer(state, player.seat);
  state.currentTurnPlayerId = nextTurn;
  state.currentTrick.currentPlayerId = nextTurn;
  return withState(match, state, {}, passedAt);
}

function applyCardTransfer(from: GuandanPlayerState, to: GuandanPlayerState, cardId: string, currentLevel: number) {
  const card = from.hand.find((item) => item.id === cardId);
  if (!card) {
    throw new Error("指定牌不存在");
  }
  from.hand = removeCardsFromHand(from.hand, [cardId], currentLevel);
  from.handCount = from.hand.length;
  to.hand = sortHand([...to.hand, card], currentLevel);
  to.handCount = to.hand.length;
  return card;
}

function findPendingRequirementByUser(tributeState: GuandanTributeState, userId: string) {
  return tributeState.requirements.find(
    (item) =>
      (item.status === "pending_tribute" && item.tributerId === userId) ||
      (item.status === "pending_return" && item.receiverId === userId)
  );
}

export function submitTribute(match: GuandanMatch, params: { userId: string; cardId: string; submittedAt?: string }) {
  ensureActiveMatch(match);
  if (match.phase !== "tribute") {
    throw new Error("当前不是贡牌阶段");
  }
  ensureParticipant(match, params.userId);
  const state = cloneState(match.state);
  const requirement = findPendingRequirementByUser(state.tributeState, params.userId);
  if (!requirement) {
    throw new Error("当前没有你的贡牌操作");
  }

  if (requirement.status === "pending_tribute") {
    const tributer = getPlayer(state, requirement.tributerId);
    if (!tributer) {
      throw new Error("贡牌玩家不存在");
    }
    const candidates = biggestTributeCandidates(tributer.hand, state.currentLevel);
    if (!candidates.some((card) => card.id === params.cardId)) {
      throw new Error("进贡必须提交当前可进贡的最大单牌");
    }
    requirement.tributeCardId = params.cardId;
    requirement.status = "pending_return";
    const receiver = getPlayer(state, requirement.receiverId);
    logEvent(state, `${tributer.userName} 已向 ${receiver?.userName ?? "对手"} 交出贡牌`);

    if (state.tributeState.requirements.every((item) => item.status !== "pending_tribute")) {
      if (state.tributeState.mode === "double" && state.tributeState.requirements.length === 2) {
        const tributePairs = state.tributeState.requirements
          .map((item) => {
            const player = getPlayer(state, item.tributerId)!;
            const card = player.hand.find((entry) => entry.id === item.tributeCardId)!;
            return { requirement: item, card, tributer: player };
          })
          .sort((left, right) => compareCardsDesc(left.card, right.card, state.currentLevel));
        const firstPlaceSeat = previousSeat(previousSeat(getPlayer(state, state.tributeState.starterPlayerId)!.seat));
        const head = getPlayer(state, state.tributeState.starterPlayerId)!;
        const headPartner = getPlayerBySeat(state, partnerSeat(head.seat))!;
        tributePairs[0]!.requirement.receiverId = head.userId;
        tributePairs[1]!.requirement.receiverId = headPartner.userId;
      }

      state.tributeState.requirements.forEach((item) => {
        const tributerPlayer = getPlayer(state, item.tributerId)!;
        const receiverPlayer = getPlayer(state, item.receiverId)!;
        applyCardTransfer(tributerPlayer, receiverPlayer, item.tributeCardId!, state.currentLevel);
      });
    }

    return withState(match, state, {}, params.submittedAt ?? nowIso());
  }

  const receiver = getPlayer(state, requirement.receiverId);
  if (!receiver) {
    throw new Error("还贡玩家不存在");
  }
  const selectedCard = receiver.hand.find((card) => card.id === params.cardId);
  if (!selectedCard || !canReturnCard(selectedCard, state.currentLevel)) {
    throw new Error("还贡必须提交 10 及以下且非级牌的单牌");
  }
  requirement.returnCardId = params.cardId;
  requirement.status = "completed";

  const tributer = getPlayer(state, requirement.tributerId)!;
  applyCardTransfer(receiver, tributer, params.cardId, state.currentLevel);
  logEvent(state, `${receiver.userName} 已向 ${tributer.userName} 还贡`);

  if (state.tributeState.requirements.every((item) => item.status === "completed" || item.status === "returned_original")) {
    const tributeCards = state.tributeState.requirements
      .map((item) => {
        const cardOwner = getPlayer(state, item.tributerId) ?? getPlayer(state, item.receiverId);
        const original = match.state.players.flatMap((player) => player.hand).find((card) => card.id === item.tributeCardId);
        return { requirement: item, card: original };
      })
      .filter((item) => item.card) as Array<{ requirement: GuandanTributeRequirement; card: GuandanCard }>;
    let starterPlayerId = state.tributeState.starterPlayerId;
    if (tributeCards.length === 1) {
      starterPlayerId = tributeCards[0]!.requirement.tributerId;
    } else if (tributeCards.length === 2) {
      const sorted = [...tributeCards].sort((left, right) => compareCardsDesc(left.card, right.card, state.currentLevel));
      if (compareCardsDesc(sorted[0]!.card, sorted[1]!.card, state.currentLevel) === 0) {
        const head = getPlayer(state, state.tributeState.starterPlayerId)!;
        starterPlayerId = rotateToNextActivePlayer(
          {
            ...state,
            players: state.players.map((player) => ({ ...player, finished: false, handCount: Math.max(1, player.handCount) }))
          },
          head.seat
        );
      } else {
        starterPlayerId = sorted[0]!.requirement.tributerId;
      }
    }
    state.currentTurnPlayerId = starterPlayerId;
    state.roundStarterPlayerId = starterPlayerId;
    state.currentTrick = createEmptyTrick(starterPlayerId);
    state.tributeState.starterPlayerId = starterPlayerId;
    logEvent(state, `贡还牌完成，由 ${getPlayer(state, starterPlayerId)?.userName ?? "当前玩家"} 先出`);
    return withState(match, state, { phase: "playing" }, params.submittedAt ?? nowIso());
  }

  return withState(match, state, {}, params.submittedAt ?? nowIso());
}

export function autoReturnTributesIfNeeded(match: GuandanMatch, updatedAt = nowIso()) {
  ensureActiveMatch(match);
  if (match.phase !== "tribute") return match;
  const state = cloneState(match.state);
  let changed = false;
  state.tributeState.requirements.forEach((requirement) => {
    if (requirement.status !== "pending_return") return;
    const receiver = getPlayer(state, requirement.receiverId);
    const tributer = getPlayer(state, requirement.tributerId);
    if (!receiver || !tributer) return;
    const canReturn = receiver.hand.some((card) => canReturnCard(card, state.currentLevel));
    if (canReturn) return;
    requirement.status = "returned_original";
    requirement.returnCardId = requirement.tributeCardId;
    changed = true;
    logEvent(state, `${receiver.userName} 没有合法还贡牌，原贡牌退回 ${tributer.userName}`);
    if (requirement.tributeCardId) {
      applyCardTransfer(receiver, tributer, requirement.tributeCardId, state.currentLevel);
    }
  });
  if (!changed) return match;
  if (state.tributeState.requirements.every((item) => item.status === "completed" || item.status === "returned_original")) {
    const starterPlayerId = state.tributeState.starterPlayerId;
    state.currentTurnPlayerId = starterPlayerId;
    state.roundStarterPlayerId = starterPlayerId;
    state.currentTrick = createEmptyTrick(starterPlayerId);
    return withState(match, state, { phase: "playing" }, updatedAt);
  }
  return withState(match, state, {}, updatedAt);
}

export function abandonMatch(match: GuandanMatch, userId: string, abandonedAt = nowIso()) {
  ensureParticipant(match, userId);
  const state = cloneState(match.state);
  const player = getPlayer(state, userId);
  logEvent(state, `${player?.userName ?? "有玩家"} 退出了房间，房间已取消`);
  return withState(match, state, { status: "cancelled", phase: "match_complete", finishedAt: abandonedAt }, abandonedAt);
}

export function sortMatches(items: GuandanMatch[]) {
  return [...items].sort((left, right) => {
    const priority = (status: GuandanMatchStatus) => {
      if (status === "active") return 0;
      if (status === "pending") return 1;
      if (status === "completed") return 2;
      return 3;
    };
    const diff = priority(left.status) - priority(right.status);
    if (diff !== 0) return diff;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export function upsertMatchList(matches: GuandanMatch[], incoming: GuandanMatch) {
  const next = new Map(matches.map((match) => [match.id, match]));
  next.set(incoming.id, incoming);
  return sortMatches(
    [...next.values()].filter((match) => GUANDAN_VISIBLE_STATUSES.includes(match.status as (typeof GUANDAN_VISIBLE_STATUSES)[number]))
  );
}

export function rowMatchesUser(match: GuandanMatch, userId: string) {
  return match.participantIds.includes(userId);
}

export function pendingRequirementForUser(match: GuandanMatch | null, userId: string) {
  if (!match) return null;
  return findPendingRequirementByUser(match.state.tributeState, userId) ?? null;
}

export function eligibleTributeCards(player: GuandanPlayerState | null, currentLevel: number) {
  if (!player) return [];
  return biggestTributeCandidates(player.hand, currentLevel);
}

export function eligibleReturnCards(player: GuandanPlayerState | null, currentLevel: number) {
  if (!player) return [];
  return sortHand(player.hand.filter((card) => canReturnCard(card, currentLevel)), currentLevel);
}
