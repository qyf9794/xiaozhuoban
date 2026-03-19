import { createId, nowIso } from "@xiaozhuoban/domain";

export const MONOPOLY_BOARD_SIDE = 7;
export const MONOPOLY_TILE_COUNT = 24;
export const MONOPOLY_INVITE_TTL_MS = 5 * 60 * 1000;
export const MONOPOLY_STARTING_CASH = 1500;
export const MONOPOLY_PASS_START_REWARD = 200;
export const MONOPOLY_MAX_ROUNDS = 12;
export const MONOPOLY_MAX_INVITEES = 3;
export const MONOPOLY_MAX_PLAYERS = 4;
export const MONOPOLY_ACTIVE_STATUSES = ["pending", "active"] as const;
export const MONOPOLY_VISIBLE_STATUSES = ["pending", "active", "completed"] as const;
export const MONOPOLY_PLAYER_COLORS = ["#f97316", "#2563eb", "#16a34a", "#db2777"] as const;

export type MonopolyMatchStatus = "pending" | "active" | "declined" | "cancelled" | "completed" | "expired";
export type MonopolyPhase = "lobby" | "await_roll" | "await_purchase_decision" | "resolving_card" | "completed";
export type MonopolyInviteStatus = "pending" | "accepted" | "declined";
export type MonopolyTileKind = "corner" | "property" | "chance" | "fate" | "fee";
export type MonopolyCornerKind = "start" | "rest" | "free_parking" | "audit";
export type MonopolyPropertyTier = "normal" | "premium";
export type MonopolyCardKind = "chance" | "fate";
export type MonopolyTurnStep = "roll" | "end";

export interface MonopolyInvite {
  userId: string;
  userName: string;
  status: MonopolyInviteStatus;
}

export interface MonopolyPlayerState {
  userId: string;
  userName: string;
  seat: number;
  color: string;
  cash: number;
  position: number;
  propertyIds: number[];
  bankrupt: boolean;
}

export interface MonopolyRankingEntry {
  userId: string;
  userName: string;
  totalAssets: number;
  cash: number;
  propertyCount: number;
  bankrupt: boolean;
  seat: number;
}

export interface MonopolyLastRoll {
  playerId: string;
  dice: [number, number];
  total: number;
}

export interface MonopolyPendingDecision {
  type: "purchase";
  playerId: string;
  tileIndex: number;
  price: number;
}

export interface MonopolyTile {
  index: number;
  name: string;
  shortName: string;
  kind: MonopolyTileKind;
  color?: string;
  badge?: string;
  price?: number;
  rent?: number;
  amount?: number;
  propertyTier?: MonopolyPropertyTier;
  cornerKind?: MonopolyCornerKind;
}

export interface MonopolyCardEffect {
  id: string;
  kind: "cash" | "move_relative" | "move_absolute";
  text: string;
  amount?: number;
  tileIndex?: number;
  collectStartReward?: boolean;
}

export interface MonopolyState {
  invites: MonopolyInvite[];
  players: MonopolyPlayerState[];
  currentPlayerIndex: number;
  currentRound: number;
  propertyOwners: Record<string, string>;
  chanceDeck: string[];
  fateDeck: string[];
  lastRoll: MonopolyLastRoll | null;
  lastEvent: string;
  pendingDecision: MonopolyPendingDecision | null;
  ranking: MonopolyRankingEntry[];
  turnStep: MonopolyTurnStep;
}

export interface MonopolyMatch {
  id: string;
  hostUserId: string;
  hostUserName: string;
  participantIds: string[];
  status: MonopolyMatchStatus;
  phase: MonopolyPhase;
  state: MonopolyState;
  revision: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
}

export const MONOPOLY_TILES: MonopolyTile[] = [
  { index: 0, name: "起点", shortName: "起点", kind: "corner", cornerKind: "start", badge: "+200" },
  { index: 1, name: "像素街区", shortName: "像素街", kind: "property", propertyTier: "normal", price: 100, rent: 26, color: "#93c5fd" },
  { index: 2, name: "命运", shortName: "命运", kind: "fate", badge: "F" },
  { index: 3, name: "相机大道", shortName: "相机道", kind: "property", propertyTier: "normal", price: 120, rent: 30, color: "#93c5fd" },
  { index: 4, name: "平台服务费", shortName: "费用", kind: "fee", amount: 100, badge: "-100" },
  { index: 5, name: "流量中枢", shortName: "中枢", kind: "property", propertyTier: "premium", price: 320, rent: 90, color: "#38bdf8" },
  { index: 6, name: "临时停靠", shortName: "停靠", kind: "corner", cornerKind: "rest", badge: "休息" },
  { index: 7, name: "校园广场", shortName: "校园", kind: "property", propertyTier: "normal", price: 140, rent: 36, color: "#86efac" },
  { index: 8, name: "机会", shortName: "机会", kind: "chance", badge: "C" },
  { index: 9, name: "星光集市", shortName: "集市", kind: "property", propertyTier: "normal", price: 160, rent: 42, color: "#86efac" },
  { index: 10, name: "设备维护费", shortName: "费用", kind: "fee", amount: 140, badge: "-140" },
  { index: 11, name: "品牌塔楼", shortName: "塔楼", kind: "property", propertyTier: "premium", price: 360, rent: 100, color: "#4ade80" },
  { index: 12, name: "免费停车", shortName: "停车", kind: "corner", cornerKind: "free_parking", badge: "免费" },
  { index: 13, name: "创作者坊", shortName: "创作坊", kind: "property", propertyTier: "normal", price: 180, rent: 48, color: "#fde047" },
  { index: 14, name: "命运", shortName: "命运", kind: "fate", badge: "F" },
  { index: 15, name: "灵感大道", shortName: "灵感道", kind: "property", propertyTier: "normal", price: 200, rent: 54, color: "#fde047" },
  { index: 16, name: "机会", shortName: "机会", kind: "chance", badge: "C" },
  { index: 17, name: "口碑长廊", shortName: "口碑廊", kind: "property", propertyTier: "normal", price: 220, rent: 60, color: "#fca5a5" },
  { index: 18, name: "稽核站", shortName: "稽核", kind: "corner", cornerKind: "audit", badge: "-180" },
  { index: 19, name: "风尚大道", shortName: "风尚道", kind: "property", propertyTier: "normal", price: 220, rent: 60, color: "#fca5a5" },
  { index: 20, name: "云端工坊", shortName: "云工坊", kind: "property", propertyTier: "normal", price: 240, rent: 68, color: "#f9a8d4" },
  { index: 21, name: "跨界广场", shortName: "跨界", kind: "property", propertyTier: "normal", price: 240, rent: 68, color: "#f9a8d4" },
  { index: 22, name: "快门大道", shortName: "快门道", kind: "property", propertyTier: "normal", price: 260, rent: 74, color: "#f9a8d4" },
  { index: 23, name: "热榜终点站", shortName: "热榜站", kind: "property", propertyTier: "normal", price: 260, rent: 74, color: "#f9a8d4" }
] as const;

export const MONOPOLY_CHANCE_CARDS: MonopolyCardEffect[] = [
  { id: "chance_cash_bonus", kind: "cash", amount: 120, text: "品牌合作到账，获得 120" },
  { id: "chance_cash_penalty", kind: "cash", amount: -80, text: "素材返工，支付 80" },
  { id: "chance_forward_three", kind: "move_relative", amount: 3, text: "灵感爆发，前进 3 格" },
  { id: "chance_back_two", kind: "move_relative", amount: -2, text: "迷路绕行，后退 2 格" },
  { id: "chance_to_hub", kind: "move_absolute", tileIndex: 5, text: "被平台推荐，前往流量中枢" },
  { id: "chance_to_start", kind: "move_absolute", tileIndex: 0, collectStartReward: true, text: "快速返场，回到起点并领取 200" }
] as const;

export const MONOPOLY_FATE_CARDS: MonopolyCardEffect[] = [
  { id: "fate_cash_bonus", kind: "cash", amount: 150, text: "获得年度奖金，收入 150" },
  { id: "fate_cash_penalty", kind: "cash", amount: -120, text: "设备损坏，支付 120" },
  { id: "fate_forward_four", kind: "move_relative", amount: 4, text: "热度上升，前进 4 格" },
  { id: "fate_back_three", kind: "move_relative", amount: -3, text: "项目延期，后退 3 格" },
  { id: "fate_to_plaza", kind: "move_absolute", tileIndex: 21, text: "受邀参加展会，前往跨界广场" },
  { id: "fate_to_start", kind: "move_absolute", tileIndex: 0, collectStartReward: true, text: "重新整装，回到起点并领取 200" }
] as const;

const chanceCardMap = new Map(MONOPOLY_CHANCE_CARDS.map((card) => [card.id, card]));
const fateCardMap = new Map(MONOPOLY_FATE_CARDS.map((card) => [card.id, card]));
const tileMap = new Map(MONOPOLY_TILES.map((tile) => [tile.index, tile]));

function isFiniteTimestamp(value: string | null | undefined) {
  if (!value) return false;
  return Number.isFinite(Date.parse(value));
}

function cloneInvites(invites: MonopolyInvite[]) {
  return invites.map((invite) => ({ ...invite }));
}

function clonePlayers(players: MonopolyPlayerState[]) {
  return players.map((player) => ({ ...player, propertyIds: [...player.propertyIds] }));
}

function cloneState(state: MonopolyState): MonopolyState {
  return {
    invites: cloneInvites(state.invites),
    players: clonePlayers(state.players),
    currentPlayerIndex: state.currentPlayerIndex,
    currentRound: state.currentRound,
    propertyOwners: { ...state.propertyOwners },
    chanceDeck: [...state.chanceDeck],
    fateDeck: [...state.fateDeck],
    lastRoll: state.lastRoll ? { ...state.lastRoll, dice: [...state.lastRoll.dice] as [number, number] } : null,
    lastEvent: state.lastEvent,
    pendingDecision: state.pendingDecision ? { ...state.pendingDecision } : null,
    ranking: state.ranking.map((item) => ({ ...item })),
    turnStep: state.turnStep
  };
}

function getTile(index: number) {
  const tile = tileMap.get(index);
  if (!tile) {
    throw new Error("棋盘格定义缺失");
  }
  return tile;
}

function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
}

function createDeck(kind: MonopolyCardKind, random = Math.random) {
  const source = kind === "chance" ? MONOPOLY_CHANCE_CARDS : MONOPOLY_FATE_CARDS;
  return shuffle(source.map((card) => card.id), random);
}

function getAcceptedInvites(match: MonopolyMatch) {
  return match.state.invites.filter((invite) => invite.status === "accepted");
}

function getPlayerIndexByUser(players: MonopolyPlayerState[], userId: string) {
  return players.findIndex((player) => player.userId === userId);
}

function getCurrentPlayer(state: MonopolyState) {
  return state.players[state.currentPlayerIndex] ?? null;
}

function canUserActOnTurn(match: MonopolyMatch, userId: string) {
  const current = getCurrentPlayer(match.state);
  return current?.userId === userId;
}

function sanitizeParticipants(userIds: string[]) {
  return [...new Set(userIds.filter(Boolean))];
}

function calculatePlayerTotalAssets(player: MonopolyPlayerState) {
  const propertyValue = player.propertyIds.reduce((sum, tileIndex) => {
    const tile = getTile(tileIndex);
    return sum + (tile.price ?? 0);
  }, 0);
  return player.cash + propertyValue;
}

function buildRanking(players: MonopolyPlayerState[]): MonopolyRankingEntry[] {
  return [...players]
    .map((player) => ({
      userId: player.userId,
      userName: player.userName,
      totalAssets: calculatePlayerTotalAssets(player),
      cash: player.cash,
      propertyCount: player.propertyIds.length,
      bankrupt: player.bankrupt,
      seat: player.seat
    }))
    .sort((left, right) => {
      if (right.totalAssets !== left.totalAssets) return right.totalAssets - left.totalAssets;
      if (right.cash !== left.cash) return right.cash - left.cash;
      if (right.propertyCount !== left.propertyCount) return right.propertyCount - left.propertyCount;
      return left.seat - right.seat;
    });
}

function refreshRanking(state: MonopolyState) {
  state.ranking = buildRanking(state.players);
  return state;
}

function createLobbyState(invites: MonopolyInvite[]): MonopolyState {
  return {
    invites,
    players: [],
    currentPlayerIndex: 0,
    currentRound: 1,
    propertyOwners: {},
    chanceDeck: [],
    fateDeck: [],
    lastRoll: null,
    lastEvent: "等待受邀玩家回应",
    pendingDecision: null,
    ranking: [],
    turnStep: "roll"
  };
}

function ensurePendingMatch(match: MonopolyMatch) {
  if (match.status !== "pending" || match.phase !== "lobby") {
    throw new Error("当前房间不可执行大厅操作");
  }
}

function ensureActiveMatch(match: MonopolyMatch) {
  if (match.status !== "active") {
    throw new Error("当前房间未开始");
  }
}

function ensureParticipant(match: MonopolyMatch, userId: string) {
  if (!match.participantIds.includes(userId)) {
    throw new Error("当前用户不在该房间中");
  }
}

function ensureHost(match: MonopolyMatch, userId: string) {
  if (match.hostUserId !== userId) {
    throw new Error("只有房主可以执行该操作");
  }
}

function withUpdatedMatch(match: MonopolyMatch, updates: Partial<MonopolyMatch>, updatedAt = nowIso()): MonopolyMatch {
  return {
    ...match,
    ...updates,
    updatedAt,
    revision: match.revision + 1
  };
}

function withState(match: MonopolyMatch, state: MonopolyState, updates: Partial<MonopolyMatch> = {}, updatedAt = nowIso()) {
  return withUpdatedMatch(
    match,
    {
      ...updates,
      state: refreshRanking(state)
    },
    updatedAt
  );
}

function activePlayers(players: MonopolyPlayerState[]) {
  return players.filter((player) => !player.bankrupt);
}

function getNextActivePlayerIndex(players: MonopolyPlayerState[], currentIndex: number) {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const nextIndex = (currentIndex + offset) % players.length;
    if (!players[nextIndex]?.bankrupt) {
      return nextIndex;
    }
  }
  return currentIndex;
}

function maybeCompleteMatch(match: MonopolyMatch, finishedAt = nowIso(), explicitEvent?: string) {
  const state = cloneState(match.state);
  const survivors = activePlayers(state.players);
  if (survivors.length <= 1 || state.currentRound > MONOPOLY_MAX_ROUNDS) {
    state.pendingDecision = null;
    state.turnStep = "end";
    state.lastEvent =
      explicitEvent ??
      (survivors.length === 1 ? `${survivors[0]?.userName ?? "玩家"} 成为最后的幸存者，游戏结束` : "达到最大轮数，开始结算");
    return withState(
      match,
      state,
      {
        status: "completed",
        phase: "completed",
        finishedAt
      },
      finishedAt
    );
  }
  if (explicitEvent) {
    state.lastEvent = explicitEvent;
  }
  return withState(match, state, {}, finishedAt);
}

function releasePlayerProperties(state: MonopolyState, player: MonopolyPlayerState) {
  player.propertyIds.forEach((tileIndex) => {
    delete state.propertyOwners[String(tileIndex)];
  });
  player.propertyIds = [];
}

function chargePlayer(
  state: MonopolyState,
  playerIndex: number,
  amount: number,
  recipientUserId: string | null,
  reasonText: string
) {
  const players = state.players;
  const payer = players[playerIndex];
  if (!payer) {
    throw new Error("玩家不存在");
  }
  if (amount <= 0) {
    return `${payer.userName}${reasonText}`;
  }

  const recipientIndex = recipientUserId ? getPlayerIndexByUser(players, recipientUserId) : -1;
  const recipient = recipientIndex >= 0 ? players[recipientIndex] : null;

  if (payer.cash >= amount) {
    payer.cash -= amount;
    if (recipient) {
      recipient.cash += amount;
    }
    return `${payer.userName}${reasonText}`;
  }

  const paidAmount = payer.cash;
  if (recipient && paidAmount > 0) {
    recipient.cash += paidAmount;
  }
  payer.cash = 0;
  payer.bankrupt = true;
  releasePlayerProperties(state, payer);
  return `${payer.userName}${reasonText}，资金不足已破产出局`;
}

function movePlayerPosition(current: number, steps: number) {
  const raw = current + steps;
  const wrapped = ((raw % MONOPOLY_TILE_COUNT) + MONOPOLY_TILE_COUNT) % MONOPOLY_TILE_COUNT;
  const passedStart = steps > 0 && raw >= MONOPOLY_TILE_COUNT;
  return { position: wrapped, passedStart };
}

function movePlayerToTile(current: number, tileIndex: number) {
  const passedStart = tileIndex < current;
  return { position: tileIndex, passedStart };
}

function resolveActivePlayersAfterAction(match: MonopolyMatch, eventText: string, actionAt = nowIso()) {
  const state = cloneState(match.state);
  const survivors = activePlayers(state.players);
  if (survivors.length <= 1) {
    state.lastEvent = eventText;
    return withState(
      match,
      state,
      {
        status: "completed",
        phase: "completed",
        finishedAt: actionAt
      },
      actionAt
    );
  }
  state.lastEvent = eventText;
  state.turnStep = "end";
  state.pendingDecision = null;
  return withState(match, state, { phase: "await_roll" }, actionAt);
}

function drawCard(state: MonopolyState, kind: MonopolyCardKind, random = Math.random) {
  const key = kind === "chance" ? "chanceDeck" : "fateDeck";
  let deck = [...state[key]];
  if (deck.length === 0) {
    deck = createDeck(kind, random);
  }
  const cardId = deck.shift();
  if (!cardId) {
    throw new Error("卡牌堆为空");
  }
  state[key] = deck;
  const card = (kind === "chance" ? chanceCardMap : fateCardMap).get(cardId);
  if (!card) {
    throw new Error("卡牌定义不存在");
  }
  return card;
}

function joinEventText(prefix: string, next: string) {
  return prefix ? `${prefix} · ${next}` : next;
}

function resolveTile(
  match: MonopolyMatch,
  tileIndex: number,
  actionAt = nowIso(),
  random = Math.random,
  eventPrefix = ""
): MonopolyMatch {
  const state = cloneState(match.state);
  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer) {
    throw new Error("当前无可操作玩家");
  }
  const tile = getTile(tileIndex);

  if (tile.kind === "corner") {
    let eventText = `${currentPlayer.userName} 停在 ${tile.name}`;
    if (tile.cornerKind === "audit") {
      eventText = chargePlayer(state, state.currentPlayerIndex, 180, null, " 在稽核站支付 180");
    }
    state.lastEvent = joinEventText(eventPrefix, eventText);
    return maybeCompleteMatch(withState(match, state, { phase: "await_roll" }, actionAt), actionAt, state.lastEvent);
  }

  if (tile.kind === "fee") {
    const eventText = chargePlayer(state, state.currentPlayerIndex, tile.amount ?? 0, null, ` 支付 ${tile.name} ${tile.amount ?? 0}`);
    state.lastEvent = joinEventText(eventPrefix, eventText);
    return maybeCompleteMatch(withState(match, state, { phase: "await_roll" }, actionAt), actionAt, state.lastEvent);
  }

  if (tile.kind === "property") {
    const ownerUserId = state.propertyOwners[String(tile.index)] ?? "";
    if (!ownerUserId) {
      state.pendingDecision = {
        type: "purchase",
        playerId: currentPlayer.userId,
        tileIndex: tile.index,
        price: tile.price ?? 0
      };
      state.lastEvent = joinEventText(eventPrefix, `${currentPlayer.userName} 来到 ${tile.name}，可选择购买`);
      state.turnStep = "end";
      return withState(match, state, { phase: "await_purchase_decision" }, actionAt);
    }
    if (ownerUserId === currentPlayer.userId) {
      const eventText = `${currentPlayer.userName} 来到自己的地产 ${tile.name}`;
      state.lastEvent = joinEventText(eventPrefix, eventText);
      return maybeCompleteMatch(withState(match, state, { phase: "await_roll" }, actionAt), actionAt, state.lastEvent);
    }

    const ownerIndex = getPlayerIndexByUser(state.players, ownerUserId);
    const ownerName = ownerIndex >= 0 ? state.players[ownerIndex]?.userName ?? "其他玩家" : "其他玩家";
    const eventText = chargePlayer(
      state,
      state.currentPlayerIndex,
      tile.rent ?? 0,
      ownerUserId,
      ` 支付 ${ownerName} 过路费 ${tile.rent ?? 0}`
    );
    state.lastEvent = joinEventText(eventPrefix, eventText);
    return maybeCompleteMatch(withState(match, state, { phase: "await_roll" }, actionAt), actionAt, state.lastEvent);
  }

  const cardKind: MonopolyCardKind = tile.kind === "chance" ? "chance" : "fate";
  const card = drawCard(state, cardKind, random);
  state.lastEvent = `${currentPlayer.userName} 抽到${tile.name}卡：${card.text}`;

  if (card.kind === "cash") {
    if ((card.amount ?? 0) >= 0) {
      currentPlayer.cash += card.amount ?? 0;
      return maybeCompleteMatch(withState(match, state, { phase: "await_roll" }, actionAt), actionAt, state.lastEvent);
    }
    const eventText = chargePlayer(state, state.currentPlayerIndex, Math.abs(card.amount ?? 0), null, ` 抽到${tile.name}卡：${card.text}`);
    state.lastEvent = eventText;
    return maybeCompleteMatch(withState(match, state, { phase: "await_roll" }, actionAt), actionAt, eventText);
  }

  const moveResult =
    card.kind === "move_relative"
      ? movePlayerPosition(currentPlayer.position, card.amount ?? 0)
      : movePlayerToTile(currentPlayer.position, card.tileIndex ?? 0);
  currentPlayer.position = moveResult.position;
  if (moveResult.passedStart || (card.collectStartReward && moveResult.position === 0)) {
    currentPlayer.cash += MONOPOLY_PASS_START_REWARD;
  }

  const movedMatch = withState(match, state, { phase: "resolving_card" }, actionAt);
  return resolveTile(movedMatch, moveResult.position, actionAt, random, state.lastEvent);
}

function normalizeInvites(value: unknown): MonopolyInvite[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const status =
        raw.status === "accepted" || raw.status === "declined" || raw.status === "pending" ? raw.status : "pending";
      const userId = typeof raw.userId === "string" ? raw.userId : "";
      const userName = typeof raw.userName === "string" ? raw.userName : "";
      if (!userId || !userName) return null;
      return { userId, userName, status };
    })
    .filter(Boolean) as MonopolyInvite[];
}

function normalizePlayers(value: unknown): MonopolyPlayerState[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const userId = typeof raw.userId === "string" ? raw.userId : "";
      const userName = typeof raw.userName === "string" ? raw.userName : "";
      if (!userId || !userName) return null;
      return {
        userId,
        userName,
        seat: typeof raw.seat === "number" ? raw.seat : index,
        color:
          typeof raw.color === "string" && raw.color
            ? raw.color
            : MONOPOLY_PLAYER_COLORS[index % MONOPOLY_PLAYER_COLORS.length] ?? "#64748b",
        cash: typeof raw.cash === "number" ? raw.cash : MONOPOLY_STARTING_CASH,
        position: typeof raw.position === "number" ? raw.position : 0,
        propertyIds: Array.isArray(raw.propertyIds)
          ? raw.propertyIds.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry))
          : [],
        bankrupt: raw.bankrupt === true
      };
    })
    .filter(Boolean) as MonopolyPlayerState[];
}

function normalizePropertyOwners(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, string>;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, owner]) => key.trim() && typeof owner === "string" && owner.trim()
  );
  return Object.fromEntries(entries) as Record<string, string>;
}

function normalizeRanking(value: unknown, players: MonopolyPlayerState[]) {
  if (!Array.isArray(value)) {
    return buildRanking(players);
  }
  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const userId = typeof raw.userId === "string" ? raw.userId : "";
      const userName = typeof raw.userName === "string" ? raw.userName : "";
      if (!userId || !userName) return null;
      return {
        userId,
        userName,
        totalAssets: typeof raw.totalAssets === "number" ? raw.totalAssets : 0,
        cash: typeof raw.cash === "number" ? raw.cash : 0,
        propertyCount: typeof raw.propertyCount === "number" ? raw.propertyCount : 0,
        bankrupt: raw.bankrupt === true,
        seat: typeof raw.seat === "number" ? raw.seat : 0
      };
    })
    .filter(Boolean) as MonopolyRankingEntry[];
  return normalized.length > 0 ? normalized : buildRanking(players);
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

  const invitees = sanitizeParticipants(params.invitees.map((item) => item.userId)).map((userId) => {
    const matched = params.invitees.find((item) => item.userId === userId);
    return { userId, userName: matched?.userName?.trim() ?? "" };
  });

  if (invitees.length === 0 || invitees.length > MONOPOLY_MAX_INVITEES) {
    throw new Error("请邀请 1 到 3 名在线用户");
  }
  if (invitees.some((entry) => !entry.userName || entry.userId === hostUserId)) {
    throw new Error("邀请列表无效");
  }

  const createdAt = params.createdAt ?? nowIso();
  const expiresAt = params.expiresAt ?? new Date(Date.parse(createdAt) + MONOPOLY_INVITE_TTL_MS).toISOString();
  const invites = invitees.map((entry) => ({
    userId: entry.userId,
    userName: entry.userName,
    status: "pending" as const
  }));

  return {
    id: createId("monopoly"),
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
  };
}

export function normalizeMonopolyState(value: unknown): MonopolyState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const invites = normalizeInvites(raw.invites);
  const players = normalizePlayers(raw.players);
  const currentPlayerIndex =
    typeof raw.currentPlayerIndex === "number" && raw.currentPlayerIndex >= 0 ? raw.currentPlayerIndex : 0;
  const currentRound = typeof raw.currentRound === "number" && raw.currentRound >= 1 ? raw.currentRound : 1;
  const turnStep = raw.turnStep === "end" ? "end" : "roll";
  const pendingDecision =
    raw.pendingDecision &&
    typeof raw.pendingDecision === "object" &&
    (raw.pendingDecision as Record<string, unknown>).type === "purchase"
      ? {
          type: "purchase" as const,
          playerId: typeof (raw.pendingDecision as Record<string, unknown>).playerId === "string"
            ? ((raw.pendingDecision as Record<string, unknown>).playerId as string)
            : "",
          tileIndex: Number((raw.pendingDecision as Record<string, unknown>).tileIndex) || 0,
          price: Number((raw.pendingDecision as Record<string, unknown>).price) || 0
        }
      : null;
  const lastRollRaw = raw.lastRoll && typeof raw.lastRoll === "object" ? (raw.lastRoll as Record<string, unknown>) : null;
  const lastRoll =
    lastRollRaw && typeof lastRollRaw.playerId === "string" && Array.isArray(lastRollRaw.dice) && lastRollRaw.dice.length === 2
      ? {
          playerId: lastRollRaw.playerId,
          dice: [Number(lastRollRaw.dice[0]) || 1, Number(lastRollRaw.dice[1]) || 1] as [number, number],
          total: Number(lastRollRaw.total) || (Number(lastRollRaw.dice[0]) || 1) + (Number(lastRollRaw.dice[1]) || 1)
        }
      : null;

  return {
    invites,
    players,
    currentPlayerIndex: Math.min(currentPlayerIndex, Math.max(players.length - 1, 0)),
    currentRound,
    propertyOwners: normalizePropertyOwners(raw.propertyOwners),
    chanceDeck: Array.isArray(raw.chanceDeck) ? raw.chanceDeck.filter((item) => typeof item === "string") : [],
    fateDeck: Array.isArray(raw.fateDeck) ? raw.fateDeck.filter((item) => typeof item === "string") : [],
    lastRoll,
    lastEvent: typeof raw.lastEvent === "string" ? raw.lastEvent : "",
    pendingDecision: pendingDecision?.playerId ? pendingDecision : null,
    ranking: normalizeRanking(raw.ranking, players),
    turnStep
  };
}

export function isPendingMatchExpired(match: MonopolyMatch, currentTime = nowIso()) {
  return match.status === "pending" && isFiniteTimestamp(match.expiresAt) && Date.parse(currentTime) >= Date.parse(match.expiresAt!);
}

export function expireMatch(match: MonopolyMatch, expiredAt = nowIso()) {
  ensurePendingMatch(match);
  const state = cloneState(match.state);
  state.lastEvent = "邀请已过期";
  return withState(
    match,
    state,
    {
      status: "expired",
      phase: "completed",
      finishedAt: expiredAt
    },
    expiredAt
  );
}

export function acceptMatch(match: MonopolyMatch, userId: string, acceptedAt = nowIso()) {
  ensurePendingMatch(match);
  const state = cloneState(match.state);
  const invite = state.invites.find((entry) => entry.userId === userId);
  if (!invite) {
    throw new Error("只有被邀请用户可以接受房间邀请");
  }
  if (invite.status !== "pending") {
    throw new Error("邀请状态已更新");
  }
  if (isPendingMatchExpired(match, acceptedAt)) {
    throw new Error("邀请已过期");
  }

  invite.status = "accepted";
  state.lastEvent = `${invite.userName} 已接受邀请`;
  return withState(match, state, {}, acceptedAt);
}

export function declineMatch(match: MonopolyMatch, userId: string, declinedAt = nowIso()) {
  ensurePendingMatch(match);
  const state = cloneState(match.state);
  const invite = state.invites.find((entry) => entry.userId === userId);
  if (!invite) {
    throw new Error("只有被邀请用户可以拒绝房间邀请");
  }
  if (invite.status !== "pending") {
    throw new Error("邀请状态已更新");
  }

  invite.status = "declined";
  const acceptedCount = state.invites.filter((entry) => entry.status === "accepted").length;
  const pendingCount = state.invites.filter((entry) => entry.status === "pending").length;
  state.lastEvent = `${invite.userName} 已拒绝邀请`;
  if (acceptedCount === 0 && pendingCount === 0) {
    return withState(
      match,
      state,
      {
        status: "declined",
        phase: "completed",
        finishedAt: declinedAt
      },
      declinedAt
    );
  }
  return withState(match, state, {}, declinedAt);
}

export function cancelMatch(match: MonopolyMatch, hostUserId: string, cancelledAt = nowIso()) {
  ensurePendingMatch(match);
  ensureHost(match, hostUserId);
  const state = cloneState(match.state);
  state.lastEvent = "房主已取消邀请";
  return withState(
    match,
    state,
    {
      status: "cancelled",
      phase: "completed",
      finishedAt: cancelledAt
    },
    cancelledAt
  );
}

export function startMatch(match: MonopolyMatch, hostUserId: string, startedAt = nowIso(), random = Math.random) {
  ensurePendingMatch(match);
  ensureHost(match, hostUserId);
  if (isPendingMatchExpired(match, startedAt)) {
    throw new Error("邀请已过期");
  }
  const acceptedInvites = getAcceptedInvites(match);
  if (acceptedInvites.length === 0) {
    throw new Error("至少需要 2 名玩家才能开始");
  }

  const players: MonopolyPlayerState[] = [
    {
      userId: match.hostUserId,
      userName: match.hostUserName,
      seat: 0,
      color: MONOPOLY_PLAYER_COLORS[0],
      cash: MONOPOLY_STARTING_CASH,
      position: 0,
      propertyIds: [],
      bankrupt: false
    },
    ...acceptedInvites.map((invite, index) => ({
      userId: invite.userId,
      userName: invite.userName,
      seat: index + 1,
      color: MONOPOLY_PLAYER_COLORS[(index + 1) % MONOPOLY_PLAYER_COLORS.length] ?? "#64748b",
      cash: MONOPOLY_STARTING_CASH,
      position: 0,
      propertyIds: [],
      bankrupt: false
    }))
  ];

  const state: MonopolyState = refreshRanking({
    invites: cloneInvites(match.state.invites),
    players,
    currentPlayerIndex: 0,
    currentRound: 1,
    propertyOwners: {},
    chanceDeck: createDeck("chance", random),
    fateDeck: createDeck("fate", random),
    lastRoll: null,
    lastEvent: `房间已开始，轮到 ${match.hostUserName} 掷骰`,
    pendingDecision: null,
    ranking: [],
    turnStep: "roll"
  });

  return withUpdatedMatch(
    match,
    {
      status: "active",
      phase: "await_roll",
      state,
      participantIds: [match.hostUserId, ...acceptedInvites.map((invite) => invite.userId)],
      startedAt
    },
    startedAt
  );
}

export function rollDice(random = Math.random): [number, number] {
  return [Math.floor(random() * 6) + 1, Math.floor(random() * 6) + 1];
}

export function submitRoll(
  match: MonopolyMatch,
  params: { userId: string; dice?: [number, number]; rolledAt?: string; random?: () => number }
) {
  ensureActiveMatch(match);
  ensureParticipant(match, params.userId);
  if (match.phase !== "await_roll") {
    throw new Error("当前阶段不可掷骰");
  }
  if (match.state.turnStep !== "roll") {
    throw new Error("当前回合已掷骰，请先结束回合");
  }
  if (!canUserActOnTurn(match, params.userId)) {
    throw new Error("还没轮到你");
  }

  const rolledAt = params.rolledAt ?? nowIso();
  const state = cloneState(match.state);
  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer) {
    throw new Error("当前玩家不存在");
  }

  const dice = params.dice ?? rollDice(params.random);
  const total = dice[0] + dice[1];
  const moved = movePlayerPosition(currentPlayer.position, total);
  currentPlayer.position = moved.position;
  if (moved.passedStart) {
    currentPlayer.cash += MONOPOLY_PASS_START_REWARD;
  }

  state.lastRoll = {
    playerId: currentPlayer.userId,
    dice,
    total
  };
  state.turnStep = "end";
  state.lastEvent = `${currentPlayer.userName} 掷出 ${dice[0]} + ${dice[1]}，前进 ${total} 格`;

  const movedMatch = withState(match, state, { phase: "await_roll" }, rolledAt);
  return resolveTile(movedMatch, moved.position, rolledAt, params.random);
}

export function purchaseProperty(match: MonopolyMatch, userId: string, purchasedAt = nowIso()) {
  ensureActiveMatch(match);
  ensureParticipant(match, userId);
  if (match.phase !== "await_purchase_decision") {
    throw new Error("当前无需购买地产");
  }
  if (!canUserActOnTurn(match, userId)) {
    throw new Error("还没轮到你");
  }

  const state = cloneState(match.state);
  const currentPlayer = getCurrentPlayer(state);
  const decision = state.pendingDecision;
  if (!currentPlayer || !decision || decision.type !== "purchase" || decision.playerId !== userId) {
    throw new Error("当前无需购买地产");
  }

  const tile = getTile(decision.tileIndex);
  if (tile.kind !== "property" || !tile.price) {
    throw new Error("地产信息无效");
  }
  if (state.propertyOwners[String(tile.index)]) {
    throw new Error("该地产已被购买");
  }
  if (currentPlayer.cash < tile.price) {
    throw new Error("当前资金不足，无法购买");
  }

  currentPlayer.cash -= tile.price;
  currentPlayer.propertyIds = [...currentPlayer.propertyIds, tile.index].sort((left, right) => left - right);
  state.propertyOwners[String(tile.index)] = currentPlayer.userId;
  state.pendingDecision = null;
  state.turnStep = "end";
  state.lastEvent = `${currentPlayer.userName} 购买了 ${tile.name}`;

  return maybeCompleteMatch(withState(match, state, { phase: "await_roll" }, purchasedAt), purchasedAt, state.lastEvent);
}

export function skipProperty(match: MonopolyMatch, userId: string, skippedAt = nowIso()) {
  ensureActiveMatch(match);
  ensureParticipant(match, userId);
  if (match.phase !== "await_purchase_decision") {
    throw new Error("当前无需处理购买决策");
  }
  if (!canUserActOnTurn(match, userId)) {
    throw new Error("还没轮到你");
  }

  const state = cloneState(match.state);
  const decision = state.pendingDecision;
  const currentPlayer = getCurrentPlayer(state);
  if (!decision || decision.playerId !== userId || !currentPlayer) {
    throw new Error("当前无需处理购买决策");
  }

  const tile = getTile(decision.tileIndex);
  state.pendingDecision = null;
  state.turnStep = "end";
  state.lastEvent = `${currentPlayer.userName} 放弃购买 ${tile.name}`;

  return maybeCompleteMatch(withState(match, state, { phase: "await_roll" }, skippedAt), skippedAt, state.lastEvent);
}

export function endTurn(match: MonopolyMatch, userId: string, endedAt = nowIso()) {
  ensureActiveMatch(match);
  ensureParticipant(match, userId);
  if (match.phase !== "await_roll") {
    throw new Error("当前阶段无法结束回合");
  }
  if (match.state.turnStep !== "end") {
    throw new Error("请先完成掷骰");
  }
  if (!canUserActOnTurn(match, userId)) {
    throw new Error("还没轮到你");
  }

  const state = cloneState(match.state);
  const survivors = activePlayers(state.players);
  if (survivors.length <= 1) {
    return maybeCompleteMatch(withState(match, state, {}, endedAt), endedAt);
  }

  const nextIndex = getNextActivePlayerIndex(state.players, state.currentPlayerIndex);
  const wrapped = nextIndex <= state.currentPlayerIndex;
  if (wrapped) {
    state.currentRound += 1;
    if (state.currentRound > MONOPOLY_MAX_ROUNDS) {
      state.lastEvent = "达到最大轮数，游戏结束";
      return maybeCompleteMatch(withState(match, state, {}, endedAt), endedAt, state.lastEvent);
    }
  }

  state.currentPlayerIndex = nextIndex;
  state.turnStep = "roll";
  state.pendingDecision = null;
  const nextPlayer = state.players[nextIndex];
  state.lastEvent = `第 ${state.currentRound} 轮，轮到 ${nextPlayer?.userName ?? "下一位玩家"} 掷骰`;
  return withState(match, state, { phase: "await_roll" }, endedAt);
}

export function sortMatches(items: MonopolyMatch[]) {
  return [...items].sort((left, right) => {
    const priority = (status: MonopolyMatchStatus) => {
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

export function upsertMatchList(matches: MonopolyMatch[], incoming: MonopolyMatch) {
  const next = new Map(matches.map((match) => [match.id, match]));
  next.set(incoming.id, incoming);
  return sortMatches(
    [...next.values()].filter((match) => MONOPOLY_VISIBLE_STATUSES.includes(match.status as (typeof MONOPOLY_VISIBLE_STATUSES)[number]))
  );
}
