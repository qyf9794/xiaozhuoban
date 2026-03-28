import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { Card } from "@xiaozhuoban/ui";
import { useAuthStore } from "../auth/authStore";
import { colorForUser, resolveUserName } from "../lib/collab";
import {
  MONOPOLY_BOARD_SIDE,
  MONOPOLY_MAX_INVITEES,
  MONOPOLY_TILES,
  getLiquidationValue,
  getPropertyLevel,
  getRentForLevel,
  upsertMatchList,
  type MonopolyInvite,
  type MonopolyMatch,
  type MonopolyMovementSegment,
  type MonopolyPlayerState
} from "../lib/monopoly";
import {
  acceptOnlineMatch,
  cancelOnlineMatch,
  createOnlineMatch,
  declineOnlineMatch,
  listRelevantMatches,
  purchaseOnlineProperty,
  removeMatchChannel,
  restartOnlineMatch,
  sellOnlineProperty,
  skipOnlineProperty,
  startOnlineMatch,
  submitOnlineRoll,
  subscribeToUserMatches,
  toMonopolyOnlineError
} from "../lib/monopolyOnline";
import { useOnlineUsers } from "../lib/useOnlineUsers";

const TILE_POSITIONS = [
  { row: 6, col: 0 },
  { row: 6, col: 1 },
  { row: 6, col: 2 },
  { row: 6, col: 3 },
  { row: 6, col: 4 },
  { row: 6, col: 5 },
  { row: 6, col: 6 },
  { row: 5, col: 6 },
  { row: 4, col: 6 },
  { row: 3, col: 6 },
  { row: 2, col: 6 },
  { row: 1, col: 6 },
  { row: 0, col: 6 },
  { row: 0, col: 5 },
  { row: 0, col: 4 },
  { row: 0, col: 3 },
  { row: 0, col: 2 },
  { row: 0, col: 1 },
  { row: 0, col: 0 },
  { row: 1, col: 0 },
  { row: 2, col: 0 },
  { row: 3, col: 0 },
  { row: 4, col: 0 },
  { row: 5, col: 0 }
] as const;

const DICE_ANIMATION_MS = 1640;
const EVENT_REVEAL_DELAY_MS = 360;
const MOBILE_VISUAL_SCALE = 0.84;
const DICE_SPIN_ANIMATION_NAME = "monopoly-dice-spin";

function scaledCompact(desktopValue: number, minValue = 0) {
  return Math.max(minValue, Math.round(desktopValue * MOBILE_VISUAL_SCALE * 10) / 10);
}

function actionButtonStyle(disabled = false, emphasis = false): CSSProperties {
  return {
    border: emphasis ? "1px solid rgba(14,165,233,0.52)" : "1px solid rgba(148,163,184,0.36)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 11,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.56 : 1,
    background: emphasis
      ? "linear-gradient(155deg, rgba(14,165,233,0.88), rgba(59,130,246,0.74))"
      : "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34))",
    color: emphasis ? "#eff6ff" : "#0f172a",
    boxShadow: emphasis ? "0 10px 18px rgba(14,165,233,0.14)" : "none"
  };
}

function rollButtonStyle(disabled = false, compact = false): CSSProperties {
  return {
    width: compact ? scaledCompact(56, 42) : 56,
    height: compact ? scaledCompact(56, 42) : 56,
    borderRadius: compact ? scaledCompact(16, 12) : 16,
    border: "1px solid rgba(220,38,38,0.92)",
    background: "#ff0000",
    color: "#ffffff",
    fontSize: compact ? scaledCompact(14, 11) : 14,
    fontWeight: 800,
    letterSpacing: 0.6,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.56 : 1,
    boxShadow: disabled ? "none" : "0 10px 18px rgba(220,38,38,0.18)"
  };
}

function tileCellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function getTileByCell(row: number, col: number) {
  const tileIndex = TILE_POSITIONS.findIndex((entry) => entry.row === row && entry.col === col);
  return tileIndex >= 0 ? MONOPOLY_TILES[tileIndex] : null;
}

function getInviteStatusText(invite: MonopolyInvite) {
  if (invite.status === "accepted") return "已接受";
  if (invite.status === "declined") return "已拒绝";
  return "待回应";
}

function getPlayerDisplay(match: MonopolyMatch | null, userId: string) {
  if (!match) return null;
  return match.state.players.find((player) => player.userId === userId) ?? null;
}

function getCurrentPlayer(match: MonopolyMatch | null) {
  if (!match) return null;
  return match.state.players[match.state.currentPlayerIndex] ?? null;
}

function getStatusText(match: MonopolyMatch | null, userId: string) {
  if (!match) {
    return "选择 1 到 3 名在线用户发起房间邀请";
  }
  if (match.status === "pending") {
    if (match.hostUserId === userId) {
      const accepted = match.state.invites.filter((invite) => invite.status === "accepted").length;
      return accepted > 0 ? `已有 ${accepted + 1} 人可开始，等待你开始游戏` : "等待受邀玩家回应";
    }
    const selfInvite = match.state.invites.find((invite) => invite.userId === userId);
    return selfInvite?.status === "accepted" ? "你已接受邀请，等待房主开始" : "收到房主邀请，确认后即可入房";
  }
  if (match.status === "completed") {
    const winner = match.state.ranking[0];
    if (!winner) {
      return "对局已结束";
    }
    return match.hostUserId === userId
      ? `${winner.userName} 成为最后的胜利者，可点击右上角重新开始`
      : `${winner.userName} 成为最后的胜利者，等待房主决定是否重新开始`;
  }
  if (match.phase === "await_purchase_decision") {
    const decision = match.state.pendingDecision;
    const currentPlayer = getCurrentPlayer(match);
    const selfPlayer = getPlayerDisplay(match, userId);
    const actionText =
      decision?.type === "upgrade" ? "升级" : decision?.type === "debt_settlement" ? "清偿" : "购买";
    const priceText = `价格 ${decision?.price ?? 0}`;
    if (decision?.playerId === userId) {
      if ((selfPlayer?.cash ?? 0) < (decision?.price ?? 0)) {
        return decision?.type === "debt_settlement"
          ? `你需支付 ${decision?.price ?? 0}，现金不足时需先变卖地产`
          : `${actionText}需要 ${decision?.price ?? 0}，现金不足，可先变卖地产`;
      }
      return decision.type === "debt_settlement"
        ? `你可支付 ${decision.price} 完成清偿`
        : decision.type === "upgrade"
        ? `你回到自己的地产，可选择升级或跳过（${priceText}）`
        : `你停在空地产，可选择购买或跳过（${priceText}）`;
    }
    return decision?.type === "debt_settlement"
      ? `等待 ${currentPlayer?.userName ?? "当前玩家"} 清偿 ${decision?.price ?? 0}`
      : `等待 ${currentPlayer?.userName ?? "当前玩家"} 决定是否${actionText}地产（${priceText}）`;
  }
  if (match.phase === "await_roll") {
    const currentPlayer = getCurrentPlayer(match);
    return currentPlayer?.userId === userId ? "轮到你掷骰" : `等待 ${currentPlayer?.userName ?? "当前玩家"} 掷骰`;
  }
  return match.state.lastEvent || "房间同步中";
}

function cardBackStyle(kind: "chance" | "fate", compact = false): CSSProperties {
  const palette =
    kind === "chance"
      ? {
          edge: "rgba(34,197,94,0.32)",
          glow: "rgba(34,197,94,0.2)",
          background: "linear-gradient(145deg, rgba(34,197,94,0.96), rgba(22,163,74,0.92))"
        }
      : {
          edge: "rgba(249,115,22,0.32)",
          glow: "rgba(249,115,22,0.2)",
          background: "linear-gradient(145deg, rgba(249,115,22,0.96), rgba(234,88,12,0.92))"
        };
  return {
    width: compact ? scaledCompact(68, 42) : 68,
    height: compact ? scaledCompact(88, 56) : 88,
    borderRadius: compact ? scaledCompact(16, 11) : 16,
    border: `1px solid ${palette.edge}`,
    background: palette.background,
    boxShadow: `0 14px 26px ${palette.glow}, inset 0 1px 0 rgba(255,255,255,0.28)`,
    backdropFilter: "blur(16px) saturate(1.2)",
    color: "#ffffff",
    fontSize: compact ? scaledCompact(12, 8.5) : 12,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    transform: kind === "chance" ? "rotate(-10deg)" : "rotate(10deg)"
  };
}

function isCurrentPlayer(match: MonopolyMatch | null, userId: string) {
  const currentPlayer = getCurrentPlayer(match);
  return currentPlayer?.userId === userId;
}

function getPlayersOnTile(match: MonopolyMatch | null, tileIndex: number) {
  if (!match) return [];
  return match.state.players.filter((player) => player.position === tileIndex);
}

function getPlayersOnDisplayTile(match: MonopolyMatch | null, positions: Record<string, number>, tileIndex: number) {
  if (!match) return [];
  return match.state.players.filter((player) => (positions[player.userId] ?? player.position) === tileIndex);
}

function getAssetSummary(player: MonopolyPlayerState | null) {
  if (!player) return "尚未入局";
  return `现金 ${player.cash} · 地产 ${player.propertyIds.length}`;
}

function getPendingDecisionLabel(decision: MonopolyMatch["state"]["pendingDecision"]) {
  return decision?.type === "upgrade" ? "升级" : decision?.type === "debt_settlement" ? "支付" : "购买";
}

function truncatePlayerName(name: string, limit = 6) {
  const chars = Array.from(name);
  return chars.length > limit ? chars.slice(0, limit).join("") : name;
}

function getStripeStyle(row: number, col: number, color: string, compact = false): CSSProperties {
  const thickness = compact ? scaledCompact(7, 5) : 7;
  if (row === 0) {
    return { position: "absolute", left: 0, right: 0, bottom: 0, height: thickness, background: color, zIndex: 0 };
  }
  if (row === MONOPOLY_BOARD_SIDE - 1) {
    return { position: "absolute", left: 0, right: 0, top: 0, height: thickness, background: color, zIndex: 0 };
  }
  if (col === 0) {
    return { position: "absolute", top: 0, bottom: 0, right: 0, width: thickness, background: color, zIndex: 0 };
  }
  return { position: "absolute", top: 0, bottom: 0, left: 0, width: thickness, background: color, zIndex: 0 };
}

function buildMovementPath(from: number, to: number, backward: boolean) {
  if (from === to) return [to];
  const path: number[] = [];
  let cursor = from;
  while (cursor !== to) {
    cursor = backward ? (cursor - 1 + MONOPOLY_TILES.length) % MONOPOLY_TILES.length : (cursor + 1) % MONOPOLY_TILES.length;
    path.push(cursor);
    if (path.length > MONOPOLY_TILES.length + 4) {
      break;
    }
  }
  return path.length > 0 ? path : [to];
}

function flattenMovementSegments(segments: MonopolyMovementSegment[] | undefined) {
  if (!segments || segments.length === 0) return [];
  return segments.flatMap((segment) => buildMovementPath(segment.from, segment.to, segment.backward));
}

function getPipPositions(value: number) {
  const center = [{ top: "50%", left: "50%" }];
  const corners = [
    { top: "24%", left: "24%" },
    { top: "24%", left: "76%" },
    { top: "76%", left: "24%" },
    { top: "76%", left: "76%" }
  ];
  const mids = [
    { top: "50%", left: "24%" },
    { top: "50%", left: "76%" }
  ];

  switch (value) {
    case 1:
      return center;
    case 2:
      return [corners[0], corners[3]];
    case 3:
      return [corners[0], center[0], corners[3]];
    case 4:
      return corners;
    case 5:
      return [...corners, center[0]];
    default:
      return [corners[0], corners[1], mids[0], mids[1], corners[2], corners[3]];
  }
}

function DiceFace({ value, rolling, compact = false }: { value: number | null; rolling: boolean; compact?: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        width: compact ? scaledCompact(38, 32) : 38,
        height: compact ? scaledCompact(38, 32) : 38,
        borderRadius: compact ? scaledCompact(12, 10) : 12,
        background: "linear-gradient(160deg, rgba(255,255,255,0.98), rgba(226,232,240,0.94))",
        border: "1px solid rgba(148,163,184,0.32)",
        boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
        transform: "translateZ(0)",
        animation: rolling ? `${DICE_SPIN_ANIMATION_NAME} ${DICE_ANIMATION_MS}ms cubic-bezier(0.2, 0.9, 0.2, 1) 1 both` : undefined,
        transition: rolling ? undefined : "transform 0.2s ease-out"
      }}
    >
      {typeof value === "number"
        ? getPipPositions(value).map((pip, index) => (
            <span
              key={`${value}-${index}`}
              style={{
                position: "absolute",
                top: pip.top,
                left: pip.left,
                width: compact ? scaledCompact(5.5, 4.5) : 5.5,
                height: compact ? scaledCompact(5.5, 4.5) : 5.5,
                borderRadius: "50%",
                background: "#0f172a",
                transform: "translate(-50%, -50%)"
              }}
            />
          ))
        : null}
    </div>
  );
}

export function MonopolyWidget({
  definition,
  instance: _instance,
  isMobileMode = false
}: {
  definition: WidgetDefinition;
  instance: WidgetInstance;
  isMobileMode?: boolean;
  onStateChange: (nextState: Record<string, unknown>) => void;
}) {
  const { user } = useAuthStore();
  const userId = user?.id ?? "";
  const userName = resolveUserName({
    email: user?.email ?? null,
    userMetadata: (user?.user_metadata as Record<string, unknown> | undefined) ?? null
  });
  const { otherUsers } = useOnlineUsers(userId, userName);
  const [matches, setMatches] = useState<MonopolyMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [selectedLiquidationTile, setSelectedLiquidationTile] = useState<number | null>(null);
  const [animatedPositions, setAnimatedPositions] = useState<Record<string, number>>({});
  const [rollingDice, setRollingDice] = useState(false);
  const [rollingDiceValues, setRollingDiceValues] = useState<[number, number]>([2, 5]);
  const [animationLocked, setAnimationLocked] = useState(false);
  const [displayedDice, setDisplayedDice] = useState<[number, number] | null>(null);
  const [displayedEvent, setDisplayedEvent] = useState("大厅已就绪");
  const [displayedStatusText, setDisplayedStatusText] = useState("选择 1 到 3 名在线用户发起房间邀请");
  const [displayedTurnPlayerId, setDisplayedTurnPlayerId] = useState("");
  const [displayedBoardMatch, setDisplayedBoardMatch] = useState<MonopolyMatch | null>(null);
  const invitePickerRef = useRef<HTMLDivElement | null>(null);
  const prevBoardMatchRef = useRef<MonopolyMatch | null>(null);
  const animationTimersRef = useRef<number[]>([]);
  const rollStartedAtRef = useRef<number | null>(null);
  const rollingDiceIntervalRef = useRef<number | null>(null);

  const clearAnimationTimers = () => {
    animationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    animationTimersRef.current = [];
  };

  const clearRollingDiceInterval = () => {
    if (rollingDiceIntervalRef.current !== null) {
      window.clearInterval(rollingDiceIntervalRef.current);
      rollingDiceIntervalRef.current = null;
    }
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoadingMatches(true);
    void listRelevantMatches(userId)
      .then((nextMatches) => {
        if (!cancelled) {
          setMatches(nextMatches);
          setOnlineError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setOnlineError(toMonopolyOnlineError(error).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMatches(false);
        }
      });

    const channel = subscribeToUserMatches(userId, (match) => {
      setMatches((prev) => upsertMatchList(prev, match));
    });
    return () => {
      cancelled = true;
      void removeMatchChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const intervalId = window.setInterval(() => {
      void listRelevantMatches(userId)
        .then((nextMatches) => {
          setMatches((prev) => {
            const changed =
              prev.length !== nextMatches.length || prev.some((match, index) => match.id !== nextMatches[index]?.id || match.revision !== nextMatches[index]?.revision);
            return changed ? nextMatches : prev;
          });
        })
        .catch(() => {
          // Realtime remains the primary path; polling is only a sync fallback.
        });
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [userId]);

  useEffect(() => {
    if (!invitePickerOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!invitePickerRef.current?.contains(event.target as Node)) {
        setInvitePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [invitePickerOpen]);

  const pendingMatch = useMemo(() => matches.find((match) => match.status === "pending") ?? null, [matches]);
  const activeMatch = useMemo(() => matches.find((match) => match.status === "active") ?? null, [matches]);
  const completedMatch = useMemo(() => matches.find((match) => match.status === "completed") ?? null, [matches]);
  const currentMatch = activeMatch ?? pendingMatch ?? completedMatch;
  const boardMatch = activeMatch ?? completedMatch;
  const selfPlayer = getPlayerDisplay(activeMatch ?? completedMatch, userId);
  const currentPlayer = getCurrentPlayer(activeMatch);
  const statusText = onlineError || (loadingMatches ? "正在同步房间..." : getStatusText(currentMatch, userId));
  const hostAcceptedCount = pendingMatch?.state.invites.filter((invite) => invite.status === "accepted").length ?? 0;
  const canHostStart = Boolean(pendingMatch && pendingMatch.hostUserId === userId && hostAcceptedCount >= 1 && !animationLocked);
  const canHostRestart = Boolean(boardMatch && boardMatch.hostUserId === userId);
  const canRoll = Boolean(activeMatch && activeMatch.phase === "await_roll" && isCurrentPlayer(activeMatch, userId) && !animationLocked);
  const canBuy = Boolean(
    activeMatch &&
      activeMatch.phase === "await_purchase_decision" &&
      activeMatch.state.pendingDecision?.playerId === userId &&
      isCurrentPlayer(activeMatch, userId) &&
      !animationLocked
  );
  const pendingDecision = activeMatch?.state.pendingDecision ?? null;
  const canAffordPendingDecision = Boolean(selfPlayer && pendingDecision && selfPlayer.cash >= pendingDecision.price);
  const sellablePropertyIds = useMemo(() => {
    if (!selfPlayer || !pendingDecision) {
      return [];
    }
    return selfPlayer.propertyIds.filter(
      (tileIndex) => !(pendingDecision.type === "upgrade" && pendingDecision.tileIndex === tileIndex)
    );
  }, [pendingDecision, selfPlayer]);
  const canLiquidate = Boolean(canBuy && pendingDecision && !canAffordPendingDecision && sellablePropertyIds.length > 0);
  const canDeclareBankruptcy = Boolean(
    canBuy &&
      pendingDecision?.type === "debt_settlement" &&
      !canAffordPendingDecision &&
      sellablePropertyIds.length === 0
  );
  const selectedLiquidationTileData =
    selectedLiquidationTile !== null && sellablePropertyIds.includes(selectedLiquidationTile)
      ? MONOPOLY_TILES[selectedLiquidationTile] ?? null
      : null;
  const selectedLiquidationLevel =
    selectedLiquidationTile !== null && boardMatch ? getPropertyLevel(boardMatch.state, selectedLiquidationTile) : 0;
  const selectedLiquidationValue =
    selectedLiquidationTileData && selectedLiquidationTileData.kind === "property"
      ? getLiquidationValue(selectedLiquidationTileData, selectedLiquidationLevel)
      : 0;
  const inviteableUsers = useMemo(() => otherUsers.slice(0, 20), [otherUsers]);
  const latestEvent = currentMatch?.state.lastEvent || "大厅已就绪";
  const displayedSelfPlayer = getPlayerDisplay(displayedBoardMatch, userId);
  const displayedCompleted = displayedBoardMatch?.status === "completed";
  const displayedSelfRank =
    displayedSelfPlayer && displayedBoardMatch
      ? displayedBoardMatch.state.ranking.findIndex((entry) => entry.userId === displayedSelfPlayer.userId) + 1
      : 0;
  const topRanking = displayedBoardMatch?.state.ranking.slice(0, 4) ?? [];
  const currentDice = activeMatch?.state.lastRoll?.dice ?? completedMatch?.state.lastRoll?.dice ?? null;
  const winnerEntry = displayedCompleted ? displayedBoardMatch.state.ranking[0] ?? null : null;
  const displayedTurnPlayer =
    displayedBoardMatch?.state.players.find((player) => player.userId === displayedTurnPlayerId) ??
    activeMatch?.state.players.find((player) => player.userId === displayedTurnPlayerId) ??
    boardMatch?.state.players.find((player) => player.userId === displayedTurnPlayerId) ??
    currentPlayer ??
    null;
  const mobileScale = isMobileMode ? MOBILE_VISUAL_SCALE : 1;
  const scaledValue = (desktopValue: number, minValue = 0) => (isMobileMode ? Math.max(minValue, Math.round(desktopValue * mobileScale * 10) / 10) : desktopValue);

  useEffect(() => {
    if (!rollingDice) {
      clearRollingDiceInterval();
      return;
    }
    setRollingDiceValues([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
    clearRollingDiceInterval();
    rollingDiceIntervalRef.current = window.setInterval(() => {
      setRollingDiceValues([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
    }, 120);
    return () => {
      clearRollingDiceInterval();
    };
  }, [rollingDice]);

  useEffect(() => {
    if (!animationLocked) {
      setDisplayedStatusText(statusText);
      setDisplayedTurnPlayerId(currentPlayer?.userId ?? "");
    }
  }, [animationLocked, currentPlayer?.userId, statusText]);

  useEffect(() => {
    if (!canLiquidate) {
      setSelectedLiquidationTile(null);
      return;
    }
    if (selectedLiquidationTile !== null && !sellablePropertyIds.includes(selectedLiquidationTile)) {
      setSelectedLiquidationTile(null);
    }
  }, [canLiquidate, selectedLiquidationTile, sellablePropertyIds]);

  useEffect(() => {
    clearAnimationTimers();

    if (!boardMatch) {
      prevBoardMatchRef.current = null;
      rollStartedAtRef.current = null;
      clearRollingDiceInterval();
      setAnimatedPositions({});
      setDisplayedDice(null);
      setDisplayedEvent(latestEvent);
      setDisplayedStatusText(statusText);
      setDisplayedTurnPlayerId("");
      setDisplayedBoardMatch(null);
      setRollingDice(false);
      setAnimationLocked(false);
      return;
    }

    const prevMatch = prevBoardMatchRef.current;
    const directPositions = Object.fromEntries(boardMatch.state.players.map((player) => [player.userId, player.position]));

    if (!prevMatch || prevMatch.id !== boardMatch.id) {
      rollStartedAtRef.current = null;
      setAnimatedPositions(directPositions);
      setDisplayedDice(currentDice);
      setDisplayedEvent(latestEvent);
      setDisplayedStatusText(statusText);
      setDisplayedTurnPlayerId(currentPlayer?.userId ?? "");
      setDisplayedBoardMatch(boardMatch);
      setRollingDice(false);
      setAnimationLocked(false);
      prevBoardMatchRef.current = boardMatch;
      return;
    }

    const resetToStart =
      prevMatch.startedAt !== boardMatch.startedAt && !boardMatch.state.lastRoll && boardMatch.state.players.every((player) => player.position === 0);
    if (resetToStart) {
      rollStartedAtRef.current = null;
      setRollingDice(false);
      setAnimationLocked(false);
      setAnimatedPositions(directPositions);
      setDisplayedDice(currentDice);
      setDisplayedEvent(latestEvent);
      setDisplayedStatusText(statusText);
      setDisplayedTurnPlayerId(currentPlayer?.userId ?? "");
      setDisplayedBoardMatch(boardMatch);
      prevBoardMatchRef.current = boardMatch;
      return;
    }

    setAnimatedPositions((prev) => {
      const next = { ...prev };
      boardMatch.state.players.forEach((player) => {
        if (typeof next[player.userId] !== "number") {
          next[player.userId] = player.position;
        }
      });
      return next;
    });

    const previousRoll = prevMatch.state.lastRoll;
    const nextRoll = boardMatch.state.lastRoll;
    const rollChanged =
      previousRoll?.playerId !== nextRoll?.playerId ||
      previousRoll?.total !== nextRoll?.total ||
      previousRoll?.dice[0] !== nextRoll?.dice[0] ||
      previousRoll?.dice[1] !== nextRoll?.dice[1];

    if (!rollChanged || !nextRoll) {
      rollStartedAtRef.current = null;
      setAnimatedPositions(directPositions);
      setDisplayedDice(currentDice);
      setDisplayedEvent(boardMatch.state.lastEvent);
      setDisplayedStatusText(statusText);
      setDisplayedTurnPlayerId(currentPlayer?.userId ?? "");
      setDisplayedBoardMatch(boardMatch);
      setRollingDice(false);
      setAnimationLocked(false);
      prevBoardMatchRef.current = boardMatch;
      return;
    }

    const movementSegments =
      boardMatch.state.lastMovement?.playerId === nextRoll.playerId ? boardMatch.state.lastMovement.segments : [];
    const movementPath = flattenMovementSegments(movementSegments);
    const startedAt = rollStartedAtRef.current;
    const hasLocalRollStart = typeof startedAt === "number";
    const elapsed = hasLocalRollStart ? performance.now() - startedAt : 0;
    const revealDelay = hasLocalRollStart ? Math.max(120, DICE_ANIMATION_MS - elapsed) : DICE_ANIMATION_MS;
    const movementStepMs = isMobileMode ? 260 : 320;
    const movementDuration = movementPath.length * movementStepMs;

    setAnimationLocked(true);
    setRollingDice(true);
    setDisplayedDice(null);

    const revealTimer = window.setTimeout(() => {
      setDisplayedDice(nextRoll.dice);
      setRollingDice(false);
    }, revealDelay);
    animationTimersRef.current.push(revealTimer);

    if (movementPath.length > 0) {
      movementPath.forEach((step, index) => {
        const timer = window.setTimeout(() => {
          setAnimatedPositions((prev) => ({ ...prev, [nextRoll.playerId]: step }));
        }, revealDelay + EVENT_REVEAL_DELAY_MS + (index + 1) * movementStepMs);
        animationTimersRef.current.push(timer);
      });
    } else {
      const syncTimer = window.setTimeout(() => {
        setAnimatedPositions(directPositions);
      }, revealDelay + EVENT_REVEAL_DELAY_MS);
      animationTimersRef.current.push(syncTimer);
    }

    const finishTimer = window.setTimeout(() => {
      setAnimatedPositions(directPositions);
      setDisplayedEvent(boardMatch.state.lastEvent);
      setDisplayedStatusText(statusText);
      setDisplayedTurnPlayerId(boardMatch.status === "active" ? (boardMatch.state.players[boardMatch.state.currentPlayerIndex]?.userId ?? "") : "");
      setDisplayedBoardMatch(boardMatch);
      setAnimationLocked(false);
      rollStartedAtRef.current = null;
    }, revealDelay + EVENT_REVEAL_DELAY_MS + movementDuration);
    animationTimersRef.current.push(finishTimer);

    prevBoardMatchRef.current = boardMatch;
    return () => {
      clearAnimationTimers();
    };
  }, [boardMatch, currentDice, currentPlayer?.userId, isMobileMode, latestEvent, statusText]);

  const runOnlineAction = async (actionId: string, task: () => Promise<MonopolyMatch>) => {
    setBusyId(actionId);
    setOnlineError("");
    try {
      const next = await task();
      setMatches((prev) => upsertMatchList(prev, next));
    } catch (error) {
      setOnlineError(toMonopolyOnlineError(error, "在线操作失败").message);
    } finally {
      setBusyId("");
    }
  };

  const handleRoll = async () => {
    if (!activeMatch || busyId) return;
    clearAnimationTimers();
    rollStartedAtRef.current = performance.now();
    setAnimationLocked(true);
    setRollingDice(true);
    setDisplayedDice(null);
    setOnlineError("");
    setBusyId(`roll:${activeMatch.id}`);
    try {
      const next = await submitOnlineRoll(activeMatch, userId);
      setMatches((prev) => upsertMatchList(prev, next));
    } catch (error) {
      rollStartedAtRef.current = null;
      setRollingDice(false);
      setAnimationLocked(false);
      setDisplayedDice(currentDice);
      setDisplayedEvent(latestEvent);
      setOnlineError(toMonopolyOnlineError(error, "在线操作失败").message);
    } finally {
      setBusyId("");
    }
  };

  const toggleInvite = (targetUserId: string) => {
    setSelectedInviteIds((prev) => {
      if (prev.includes(targetUserId)) {
        return prev.filter((item) => item !== targetUserId);
      }
      if (prev.length >= MONOPOLY_MAX_INVITEES) {
        return prev;
      }
      return [...prev, targetUserId];
    });
  };

  const createLobby = () => {
    const invitees = selectedInviteIds
      .map((inviteeId) => inviteableUsers.find((entry) => entry.userId === inviteeId))
      .filter(Boolean)
      .map((entry) => ({ userId: entry!.userId, userName: entry!.userName }));
    if (invitees.length === 0) {
      setOnlineError("请至少选择 1 名在线用户");
      return;
    }
    setInvitePickerOpen(false);
    setSelectedInviteIds([]);
    void runOnlineAction("create-monopoly-room", () =>
      createOnlineMatch({
        hostUserId: userId,
        hostUserName: userName,
        invitees
      })
    );
  };

  const toggleLiquidationSelection = (tileIndex: number) => {
    if (!canLiquidate || !sellablePropertyIds.includes(tileIndex)) {
      return;
    }
    setSelectedLiquidationTile((current) => (current === tileIndex ? null : tileIndex));
  };

  const cardPadding = isMobileMode ? `${scaledValue(6, 5)}px ${scaledValue(10, 8)}px ${scaledValue(6, 5)}px` : 8;
  const sectionGap = scaledValue(8, 6);
  const boardGap = scaledValue(4, 1);
  const boardPadding = scaledValue(6, 2);

  return (
    <Card
      title={definition.name}
      tone="peach"
      style={{
        height: "auto",
        minHeight: 0,
        padding: cardPadding
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: sectionGap, minHeight: 0 }}>
        <style>
          {`
            @keyframes ${DICE_SPIN_ANIMATION_NAME} {
              0% {
                transform: rotate(0deg) scale(0.96);
              }
              24% {
                transform: rotate(210deg) scale(1.04);
              }
              52% {
                transform: rotate(455deg) scale(0.98);
              }
              78% {
                transform: rotate(645deg) scale(1.02);
              }
              100% {
                transform: rotate(720deg) scale(1);
              }
            }
          `}
        </style>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: sectionGap,
            alignItems: "start"
          }}
        >
          <div style={{ fontSize: scaledValue(13, 11), color: "#475569", minHeight: scaledValue(18, 16), display: "flex", alignItems: "center" }}>
            {displayedStatusText}
          </div>
          <div ref={invitePickerRef} style={{ position: "relative", display: "flex", gap: 6, alignItems: "center" }}>
            {!activeMatch && !pendingMatch ? (
              <button type="button" style={actionButtonStyle(false, true)} onClick={() => setInvitePickerOpen((open) => !open)}>
                邀请开局
              </button>
            ) : null}
            {pendingMatch && pendingMatch.hostUserId === userId ? (
              <>
                <button
                  type="button"
                  style={actionButtonStyle(Boolean(busyId), true)}
                  disabled={!canHostStart || Boolean(busyId)}
                  onClick={() => void runOnlineAction(`start:${pendingMatch.id}`, () => startOnlineMatch(pendingMatch, userId))}
                >
                  开始
                </button>
                <button
                  type="button"
                  style={actionButtonStyle(Boolean(busyId))}
                  disabled={Boolean(busyId)}
                  onClick={() => void runOnlineAction(`cancel:${pendingMatch.id}`, () => cancelOnlineMatch(pendingMatch, userId))}
                >
                  取消
                </button>
              </>
            ) : null}
            {canHostRestart ? (
              <button
                type="button"
                style={actionButtonStyle(Boolean(busyId))}
                disabled={Boolean(busyId)}
                onClick={() => boardMatch && void runOnlineAction(`restart:${boardMatch.id}`, () => restartOnlineMatch(boardMatch, userId))}
              >
                重新开始
              </button>
            ) : null}
            {invitePickerOpen ? (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  zIndex: 6,
                  width: scaledValue(260, 236),
                  maxWidth: isMobileMode ? "min(236px, calc(100vw - 32px))" : undefined,
                  boxSizing: "border-box",
                  display: "grid",
                  gap: 8,
                  padding: 10,
                  borderRadius: 16,
                  border: "1px solid rgba(148,163,184,0.24)",
                  background: "rgba(255,255,255,0.92)",
                  boxShadow: "0 18px 34px rgba(15,23,42,0.12)",
                  backdropFilter: "blur(10px)"
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>选择 1-3 位在线用户</div>
                {inviteableUsers.length > 0 ? (
                  inviteableUsers.map((entry) => {
                    const checked = selectedInviteIds.includes(entry.userId);
                    const disabled = !checked && selectedInviteIds.length >= MONOPOLY_MAX_INVITEES;
                    return (
                      <label
                        key={entry.userId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr auto",
                          gap: 8,
                          alignItems: "center",
                          minWidth: 0,
                          padding: "7px 8px",
                          borderRadius: 12,
                          background: checked ? "rgba(59,130,246,0.08)" : "rgba(248,250,252,0.9)",
                          color: "#0f172a",
                          opacity: disabled ? 0.55 : 1,
                          cursor: disabled ? "default" : "pointer"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleInvite(entry.userId)}
                          data-no-drag="true"
                        />
                        <span
                          style={{
                            fontSize: 12,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {entry.userName}
                        </span>
                        <span style={{ fontSize: 10, color: "#64748b", flexShrink: 0 }}>在线</span>
                      </label>
                    );
                  })
                ) : (
                  <div style={{ fontSize: 11, color: "#64748b" }}>暂无可邀请的在线用户</div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>已选 {selectedInviteIds.length} 人</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" style={actionButtonStyle(false)} onClick={() => setInvitePickerOpen(false)}>
                      关闭
                    </button>
                    <button type="button" style={actionButtonStyle(false, true)} onClick={createLobby}>
                      发起邀请
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {pendingMatch ? (
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: scaledValue(10, 8),
              borderRadius: 16,
              background: "linear-gradient(155deg, rgba(255,255,255,0.74), rgba(241,245,249,0.5))",
              border: "1px solid rgba(226,232,240,0.8)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
                房主：{pendingMatch.hostUserName} · 房间待开始
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{hostAcceptedCount + 1} 人可入局</div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {pendingMatch.state.invites.map((invite) => {
                const isSelfInvite = invite.userId === userId;
                return (
                  <div
                    key={invite.userId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 8,
                      alignItems: "center",
                      borderRadius: 12,
                      padding: "7px 9px",
                      background: "rgba(255,255,255,0.65)"
                    }}
                  >
                    <div style={{ display: "grid", gap: 2 }}>
                      <span style={{ fontSize: 12, color: "#0f172a" }}>{invite.userName}</span>
                      <span style={{ fontSize: 10, color: "#64748b" }}>{getInviteStatusText(invite)}</span>
                    </div>
                    {isSelfInvite && invite.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          style={actionButtonStyle(Boolean(busyId), true)}
                          disabled={Boolean(busyId)}
                          onClick={() => void runOnlineAction(`accept:${pendingMatch.id}`, () => acceptOnlineMatch(pendingMatch, userId))}
                        >
                          接受
                        </button>
                        <button
                          type="button"
                          style={actionButtonStyle(Boolean(busyId))}
                          disabled={Boolean(busyId)}
                          onClick={() => void runOnlineAction(`decline:${pendingMatch.id}`, () => declineOnlineMatch(pendingMatch, userId))}
                        >
                          拒绝
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{invite.status === "accepted" ? "已加入" : ""}</span>
                        <span />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: sectionGap
          }}
        >
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: `repeat(${MONOPOLY_BOARD_SIDE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${MONOPOLY_BOARD_SIDE}, minmax(0, 1fr))`,
              width: "100%",
              aspectRatio: "1 / 1",
              borderRadius: isMobileMode ? 12 : 20,
              padding: boardPadding,
              gap: boardGap,
              background: "linear-gradient(150deg, rgba(219,239,236,0.56), rgba(204,228,223,0.34))",
              border: "1px solid rgba(255,255,255,0.42)",
              backdropFilter: "blur(18px) saturate(1.12)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.48), inset 0 -10px 24px rgba(15,23,42,0.05), 0 18px 36px rgba(15,23,42,0.08)"
            }}
          >
            {Array.from({ length: MONOPOLY_BOARD_SIDE }, (_, row) =>
              Array.from({ length: MONOPOLY_BOARD_SIDE }, (_, col) => {
                if (row >= 1 && row <= 5 && col >= 1 && col <= 5) {
                  if (row !== 1 || col !== 1) {
                    return null;
                  }
                  return (
                    <div
                      key="monopoly-center"
                      style={{
                        gridColumn: "2 / span 5",
                        gridRow: "2 / span 5",
                        width: isMobileMode ? "calc(100% - 4px)" : "100%",
                        height: isMobileMode ? "calc(100% - 4px)" : "calc(100% - 8px)",
                        boxSizing: "border-box",
                        maxWidth: "100%",
                        maxHeight: "100%",
                        justifySelf: "center",
                        alignSelf: "center",
                        display: "grid",
                        gridTemplateRows: "auto auto 1fr",
                        gap: scaledValue(8, 4),
                        alignContent: "start",
                        padding: isMobileMode ? "7px 6px 5px" : scaledValue(12, 8),
                        borderRadius: isMobileMode ? 11 : 18,
                        overflow: "hidden",
                        background:
                          "linear-gradient(160deg, rgba(255,255,255,0.42), rgba(255,255,255,0.14)), radial-gradient(circle at top, rgba(125,211,252,0.16), rgba(255,255,255,0) 72%)",
                        border: "1px solid rgba(255,255,255,0.34)",
                        backdropFilter: "blur(18px) saturate(1.08)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.34)"
                      }}
                    >
                        <div style={{ display: "grid", gap: scaledValue(5, 3), maxWidth: "100%", minWidth: 0 }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: 6,
                            alignItems: "center",
                            width: "100%",
                            maxWidth: "100%",
                            minWidth: 0
                          }}
                        >
                          <div style={{ maxWidth: "100%", minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 3,
                                minWidth: 0,
                                whiteSpace: "nowrap",
                                overflow: "hidden"
                              }}
                            >
                              <span style={{ fontSize: isMobileMode ? 6.5 : scaledValue(10, 9), fontWeight: 700, color: "#64748b", flexShrink: 0 }}>
                                {displayedCompleted ? "胜者" : "当前玩家"}
                              </span>
                              <span
                                style={{
                                  fontSize: isMobileMode ? 10 : scaledValue(15, 13),
                                  fontWeight: 700,
                                  color: displayedCompleted ? (winnerEntry ? colorForUser(winnerEntry.userId) : "#0f172a") : displayedTurnPlayer?.color ?? "#0f172a",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis"
                                }}
                              >
                                {displayedCompleted
                                  ? winnerEntry
                                    ? `#${winnerEntry.seat + 1} ${truncatePlayerName(winnerEntry.userName)}`
                                    : "等待结果"
                                  : displayedTurnPlayer
                                    ? `#${displayedTurnPlayer.seat + 1} ${truncatePlayerName(displayedTurnPlayer.userName)}`
                                    : "等待开局"}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: isMobileMode ? 7 : scaledValue(11, 10),
                                color: "#64748b",
                                marginTop: scaledValue(2, 2),
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                              }}
                            >
                              {displayedCompleted
                                ? winnerEntry
                                  ? canHostRestart
                                    ? `${winnerEntry.userName} 成为最后的胜利者，可点击右上角重新开始`
                                    : `${winnerEntry.userName} 成为最后的胜利者，等待房主决定是否重新开始`
                                  : "对局已结束"
                                : displayedSelfPlayer
                                  ? `我的资产：${getAssetSummary(displayedSelfPlayer)}`
                                  : "房主邀请后开始"}
                            </div>
                          </div>
                          {displayedSelfPlayer && !displayedCompleted ? (
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: isMobileMode ? 7 : scaledValue(10, 9), color: "#64748b" }}>我的位次</div>
                              <div style={{ fontSize: isMobileMode ? 9 : scaledValue(12, 11), fontWeight: 700, color: "#0f172a" }}>
                                #{displayedSelfRank || 1}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: `minmax(0, 1fr) ${scaledValue(92, 72)}px`,
                            gap: scaledValue(10, 4),
                            alignItems: "center",
                            borderRadius: isMobileMode ? 12 : 16,
                            padding: isMobileMode ? "6px 8px" : `${scaledValue(9, 8)}px ${scaledValue(10, 9)}px`,
                            background: "rgba(255,255,255,0.42)",
                            backdropFilter: "blur(12px)",
                            minHeight: isMobileMode ? 58 : 72,
                            width: isMobileMode ? "calc(100% - 10px)" : "100%",
                            maxWidth: "100%",
                            justifySelf: "center",
                            boxSizing: "border-box"
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            {!isMobileMode ? <div style={{ fontSize: scaledValue(11, 10), color: "#64748b" }}>最近事件</div> : null}
                            <div
                              style={{
                                fontSize: isMobileMode ? 9 : 13,
                                lineHeight: 1.3,
                                color: "#0f172a",
                                marginTop: isMobileMode ? 0 : scaledValue(2, 2),
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: 3,
                                overflow: "hidden",
                                textAlign: "left"
                              }}
                            >
                              {displayedEvent}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                              width: scaledValue(92, 72),
                              minWidth: scaledValue(92, 72),
                              justifyContent: "flex-end"
                            }}
                          >
                            {rollingDice ? (
                              rollingDiceValues.map((value, index) => (
                                <DiceFace key={`rolling-${index}-${value}`} value={value} rolling compact={isMobileMode} />
                              ))
                            ) : displayedDice ? (
                              displayedDice.map((value, index) => (
                                <DiceFace key={`${value}-${index}`} value={value} rolling={rollingDice} compact={isMobileMode} />
                              ))
                            ) : (
                              <div style={{ fontSize: scaledValue(11, 10), color: "#94a3b8" }}>骰子待掷</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: scaledValue(10, 6),
                          marginTop: isMobileMode ? 2 : scaledValue(10, 4)
                        }}
                      >
                        <div style={{ display: "flex", gap: isMobileMode ? 4 : scaledValue(12, 5), alignItems: "center", minWidth: 0 }}>
                          <div style={cardBackStyle("chance", isMobileMode)}>机会</div>
                          <div style={cardBackStyle("fate", isMobileMode)}>命运</div>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gap: scaledValue(6, 5),
                            justifyItems: "end",
                            marginRight: isMobileMode ? 1 : scaledValue(16, 4),
                            maxWidth: scaledValue(170, 152)
                          }}
                        >
                          {canRoll ? (
                            <button
                              type="button"
                              style={rollButtonStyle(Boolean(busyId), isMobileMode)}
                              disabled={Boolean(busyId)}
                              onClick={() => void handleRoll()}
                            >
                              掷骰
                            </button>
                          ) : null}
                          {canBuy ? (
                            <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                              {!canAffordPendingDecision ? (
                                <div
                                  style={{
                                    fontSize: isMobileMode ? 8 : 10.5,
                                    lineHeight: 1.25,
                                    color: canLiquidate ? "#92400e" : "#991b1b",
                                    textAlign: "right",
                                    maxWidth: "100%"
                                  }}
                                >
                                  {canLiquidate
                                    ? `现金不足，先点持有土地再变卖后${getPendingDecisionLabel(pendingDecision)}`
                                    : canDeclareBankruptcy
                                      ? "现金不足且名下已无资产，可判定破产"
                                      : "现金不足"}
                                </div>
                              ) : null}
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <button
                                  type="button"
                                  style={actionButtonStyle(Boolean(busyId) || !canAffordPendingDecision, true)}
                                  disabled={Boolean(busyId) || !canAffordPendingDecision}
                                  onClick={() =>
                                    activeMatch && void runOnlineAction(`buy:${activeMatch.id}`, () => purchaseOnlineProperty(activeMatch, userId))
                                  }
                                >
                                  {getPendingDecisionLabel(pendingDecision)}
                                </button>
                                {canLiquidate ? (
                                  <button
                                    type="button"
                                    style={actionButtonStyle(Boolean(busyId) || selectedLiquidationTileData === null)}
                                    disabled={Boolean(busyId) || selectedLiquidationTileData === null}
                                    onClick={() =>
                                      activeMatch &&
                                      selectedLiquidationTile !== null &&
                                      void runOnlineAction(`sell:${activeMatch.id}:${selectedLiquidationTile}`, () =>
                                        sellOnlineProperty(activeMatch, userId, selectedLiquidationTile)
                                      )
                                    }
                                  >
                                    {selectedLiquidationTileData ? `变卖 +${selectedLiquidationValue}` : "变卖"}
                                  </button>
                                ) : null}
                                {pendingDecision?.type !== "debt_settlement" || canAffordPendingDecision || canDeclareBankruptcy ? (
                                  <button
                                    type="button"
                                    style={actionButtonStyle(Boolean(busyId))}
                                    disabled={Boolean(busyId)}
                                    onClick={() =>
                                      activeMatch && void runOnlineAction(`skip:${activeMatch.id}`, () => skipOnlineProperty(activeMatch, userId))
                                    }
                                  >
                                    {canDeclareBankruptcy ? "破产" : "跳过"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: isMobileMode ? 2 : 4,
                          padding: 0,
                          alignSelf: "end",
                          marginTop: isMobileMode ? 0 : "auto",
                          marginBottom: isMobileMode ? 2 : 0,
                          background: "transparent",
                          minHeight: 0,
                          width: "100%",
                          maxWidth: "100%",
                          minWidth: 0,
                          justifySelf: "stretch"
                        }}
                      >
                        <div style={{ fontSize: isMobileMode ? 7 : scaledValue(10, 8.5), color: "#475569", fontWeight: 600, lineHeight: 1 }}>
                          {displayedCompleted ? "最终排名" : "资产榜"}
                        </div>
                        {topRanking.length > 0 ? (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                topRanking.length <= 1
                                  ? "minmax(0, 1fr)"
                                  : topRanking.length === 2
                                    ? "repeat(2, minmax(0, 1fr))"
                                    : "repeat(2, minmax(0, 1fr))",
                              gap: topRanking.length === 2 ? (isMobileMode ? 4 : scaledValue(10, 8)) : isMobileMode ? 0 : scaledValue(4, 2),
                              alignItems: "end",
                              width: "100%",
                              maxWidth: "100%"
                            }}
                          >
                            {topRanking.map((entry, index) => (
                              <div
                                key={entry.userId}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                                  alignItems: "center",
                                  gap: isMobileMode ? 1.5 : scaledValue(5, 3),
                                  padding: isMobileMode ? "0.5px 0" : "1px 0",
                                  fontSize: isMobileMode ? 6.5 : displayedCompleted ? 10.5 : 10,
                                  color: "#0f172a",
                                  minWidth: 0,
                                  lineHeight: 1
                                }}
                              >
                                <span style={{ color: displayedCompleted && index === 0 ? "#b91c1c" : "#64748b", fontWeight: 700 }}>{`No.${index + 1}`}</span>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {truncatePlayerName(entry.userName)}
                                </span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    minWidth: isMobileMode ? 56 : 78,
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums"
                                  }}
                                >
                                  {`${entry.totalAssets} (${entry.cash})`}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: scaledValue(11, 10), color: "#94a3b8" }}>开局后显示资产榜</div>
                        )}
                      </div>
                    </div>
                  );
                }

                const tile = getTileByCell(row, col);
                if (!tile) {
                  return (
                    <div
                      key={tileCellKey(row, col)}
                      style={{
                        borderRadius: 14,
                        background: "rgba(255,255,255,0.18)"
                      }}
                    />
                  );
                }
                const playersOnTile = getPlayersOnDisplayTile(boardMatch, animatedPositions, tile.index);
                const ownerUserId = boardMatch?.state.propertyOwners[String(tile.index)];
                const ownerPlayer = boardMatch?.state.players.find((player) => player.userId === ownerUserId);
                const propertyLevel = boardMatch ? getPropertyLevel(boardMatch.state, tile.index) : 0;
                const isCorner = tile.kind === "corner";
                const isSellableProperty =
                  tile.kind === "property" && canLiquidate && ownerUserId === userId && sellablePropertyIds.includes(tile.index);
                const isSelectedForLiquidation = isSellableProperty && selectedLiquidationTile === tile.index;
                const tokenInset = scaledValue(4, 3);
                const stripeThickness = isMobileMode ? scaledCompact(7, 5) : 7;
                const tokenBottomInset = tokenInset + (row === 0 && tile.color ? stripeThickness : 0);
                const tokenLeftInset = tokenInset + (col === MONOPOLY_BOARD_SIDE - 1 && tile.color ? stripeThickness : 0);
                const tileBackground =
                  ownerPlayer && tile.kind === "property"
                    ? ownerPlayer.color
                    : isCorner
                      ? "linear-gradient(150deg, rgba(255,250,240,0.96), rgba(255,237,213,0.9))"
                      : "linear-gradient(160deg, rgba(255,255,255,0.92), rgba(248,250,252,0.86))";
                const primaryTextColor = ownerPlayer && tile.kind === "property" ? "#f8fafc" : "#0f172a";
                const secondaryTextColor = ownerPlayer && tile.kind === "property" ? "rgba(248,250,252,0.88)" : "#64748b";

                return (
                  <div
                    key={tileCellKey(row, col)}
                    data-no-drag={isSellableProperty ? "true" : undefined}
                    onClick={isSellableProperty ? () => toggleLiquidationSelection(tile.index) : undefined}
                    style={{
                      position: "relative",
                      display: "grid",
                      alignContent: "space-between",
                      padding: scaledValue(7, 4),
                      borderRadius: isCorner ? (isMobileMode ? 9 : 16) : isMobileMode ? 7 : 12,
                      border: isSelectedForLiquidation
                        ? "2px solid rgba(217,119,6,0.92)"
                        : isSellableProperty
                          ? "1px solid rgba(217,119,6,0.56)"
                          : "1px solid rgba(15,23,42,0.08)",
                      background: tileBackground,
                      overflow: "hidden",
                      cursor: isSellableProperty ? "pointer" : "default",
                      boxShadow: isSelectedForLiquidation
                        ? "0 0 0 2px rgba(255,251,235,0.92), 0 14px 24px rgba(217,119,6,0.2)"
                        : undefined
                    }}
                  >
                    {tile.color ? <div style={getStripeStyle(row, col, tile.color, isMobileMode)} /> : null}
                    {isSelectedForLiquidation ? (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "linear-gradient(160deg, rgba(251,191,36,0.18), rgba(245,158,11,0.06))",
                          zIndex: 0
                        }}
                      />
                    ) : null}
                    <div
                      style={{
                        display: "grid",
                        gap: 3,
                        position: "relative",
                        zIndex: 1,
                        marginTop: row === MONOPOLY_BOARD_SIDE - 1 && tile.color ? 6 : 0,
                        marginBottom: row === 0 && tile.color ? 6 : 0,
                        marginLeft: col === MONOPOLY_BOARD_SIDE - 1 && tile.color ? 6 : 0,
                        marginRight: col === 0 && tile.color ? 6 : 0
                      }}
                    >
                      <div style={{ fontSize: isMobileMode ? 7.5 : scaledValue(10, 8), fontWeight: 700, color: primaryTextColor, lineHeight: 1.05 }}>
                        {tile.shortName}{tile.kind === "property" && propertyLevel > 0 ? `+${propertyLevel}` : ""}
                      </div>
                      <div style={{ fontSize: isMobileMode ? 7 : scaledValue(9, 7.5), color: secondaryTextColor, lineHeight: 1 }}>
                        {tile.kind === "property"
                          ? `${tile.price} / 租 ${getRentForLevel(tile, propertyLevel)}`
                          : tile.price
                            ? `${tile.price} / 租 ${tile.rent}`
                            : tile.badge ?? tile.name}
                      </div>
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        left: tokenLeftInset,
                        bottom: tokenBottomInset,
                        zIndex: 4,
                        pointerEvents: "none"
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(2, ${scaledValue(16, 14)}px)`, gap: scaledValue(5, 3) }}>
                        {playersOnTile.slice(0, 4).map((player) => (
                          <span
                            key={player.userId}
                            title={player.userName}
                            style={{
                              width: scaledValue(16, 14),
                              height: scaledValue(16, 14),
                              borderRadius: "50%",
                              background: player.color,
                              boxShadow: "0 0 0 2px rgba(255,255,255,0.82)",
                              color: "#f8fafc",
                              fontSize: scaledValue(8, 7),
                              fontWeight: 700,
                              display: "grid",
                              placeItems: "center"
                            }}
                          >
                            {player.seat + 1}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
