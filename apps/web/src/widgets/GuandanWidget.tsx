import { useEffect, useMemo, useState } from "react";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { Card } from "@xiaozhuoban/ui";
import { useAuthStore } from "../auth/authStore";
import { colorForUser, resolveUserName } from "../lib/collab";
import {
  detectCombo,
  eligibleReturnCards,
  eligibleTributeCards,
  pendingRequirementForUser,
  sortHand,
  upsertMatchList,
  type GuandanCard,
  type GuandanMatch,
  type GuandanPlayerState
} from "../lib/guandan";
import {
  abandonOnlineMatch,
  acceptOnlineMatch,
  cancelOnlineMatch,
  createOnlineMatch,
  declineOnlineMatch,
  listRelevantMatches,
  passOnlineTurn,
  removeMatchChannel,
  restartOnlineMatch,
  startOnlineMatch,
  submitOnlinePlay,
  submitOnlineTribute,
  subscribeToUserMatches,
  toGuandanOnlineError
} from "../lib/guandanOnline";
import { useOnlineUsers } from "../lib/useOnlineUsers";

interface SeatDisplay {
  userId: string;
  userName: string;
  seat: number;
  team: 0 | 1;
  handCount: number | null;
  reportedCount: number | null;
  finishOrder: number | null;
  waitingText: string;
}

function actionButton(disabled = false, emphasis = false) {
  return {
    border: emphasis ? "1px solid rgba(220,38,38,0.46)" : "1px solid rgba(148,163,184,0.34)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 11,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.56 : 1,
    background: emphasis
      ? "linear-gradient(155deg, rgba(239,68,68,0.86), rgba(220,38,38,0.74))"
      : "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34))",
    color: emphasis ? "#fff7ed" : "#0f172a"
  } as const;
}

function playerSlotStyle(slot: 0 | 1 | 2 | 3) {
  if (slot === 0) return { gridColumn: "2 / span 3", gridRow: 3 };
  if (slot === 1) return { gridColumn: 5, gridRow: 2 };
  if (slot === 2) return { gridColumn: "2 / span 3", gridRow: 1 };
  return { gridColumn: 1, gridRow: 2 };
}

function getStatusText(match: GuandanMatch | null, userId: string) {
  if (!match) return "邀请 3 名在线用户创建 4 人房间";
  if (match.status === "pending") {
    if (match.hostUserId === userId) {
      const accepted = match.state.invites.filter((invite) => invite.status === "accepted").length;
      return accepted === 3 ? "4 人已到齐，可开始发牌" : `房间已创建，等待其余玩家到齐 ${accepted + 1}/4`;
    }
    const invite = match.state.invites.find((item) => item.userId === userId);
    return invite?.status === "accepted" ? "你已接受邀请，等待房主开始" : "收到掼蛋邀请，确认后加入房间";
  }
  if (match.status === "completed") return match.state.lastEvent || "整场已结束，可由房主重新开局";
  if (match.status === "cancelled") return "房间已取消，可由房主重新开始";
  if (match.phase === "tribute") {
    const current = pendingRequirementForUser(match, userId);
    if (current?.status === "pending_tribute") return "轮到你进贡";
    if (current?.status === "pending_return") return "轮到你还贡";
    return match.state.lastEvent || "正在贡还牌";
  }
  if (match.phase === "playing") {
    const current = match.state.players.find((player) => player.userId === match.state.currentTurnPlayerId);
    return current?.userId === userId ? "轮到你操作" : `等待 ${current?.userName ?? "其他玩家"} 出牌`;
  }
  return match.state.lastEvent || "房间同步中";
}

function buildSeatDisplays(match: GuandanMatch | null, currentUserId: string): SeatDisplay[] {
  if (!match) return [];
  if (match.state.players.length > 0) {
    return match.state.players.map((player) => ({
      userId: player.userId,
      userName: player.userName,
      seat: player.seat,
      team: player.team,
      handCount: player.handCount,
      reportedCount: player.reportedCount,
      finishOrder: player.finishOrder,
      waitingText: player.finished ? "已出完" : "已就位"
    }));
  }

  const inviteMap = new Map(match.state.invites.map((invite, index) => [invite.userId, { invite, seat: index + 1 }]));
  const entries: SeatDisplay[] = [
    {
      userId: match.hostUserId,
      userName: match.hostUserName,
      seat: 0,
      team: 0,
      handCount: null,
      reportedCount: null,
      finishOrder: null,
      waitingText: "房主"
    }
  ];

  match.state.invites.forEach((invite, index) => {
    entries.push({
      userId: invite.userId,
      userName: invite.userName,
      seat: index + 1,
      team: ((index + 1) % 2 === 0 ? 0 : 1),
      handCount: null,
      reportedCount: null,
      finishOrder: null,
      waitingText: invite.status === "accepted" ? "已就位" : invite.status === "declined" ? "已拒绝" : "等待中"
    });
  });

  if (!entries.some((item) => item.userId === currentUserId)) {
    const invite = inviteMap.get(currentUserId);
    if (invite) {
      entries.push({
        userId: currentUserId,
        userName: invite.invite.userName,
        seat: invite.seat,
        team: (invite.seat % 2 === 0 ? 0 : 1),
        handCount: null,
        reportedCount: null,
        finishOrder: null,
        waitingText: invite.invite.status === "accepted" ? "已就位" : "等待中"
      });
    }
  }

  return entries.sort((left, right) => left.seat - right.seat).slice(0, 4);
}

function getSeatPlayer(players: SeatDisplay[], currentUserId: string, targetSlot: 0 | 1 | 2 | 3) {
  const anchor = players.find((player) => player.userId === currentUserId) ?? players[0] ?? null;
  if (!anchor) return null;
  const targetSeat = (anchor.seat + targetSlot) % 4;
  return players.find((player) => player.seat === targetSeat) ?? null;
}

function userDisplayColor(userId: string | null | undefined, userName: string | null | undefined) {
  return colorForUser(userId || userName || "guest");
}

function relationLabelForUser(players: SeatDisplay[], currentUserId: string, targetUserId: string | null | undefined) {
  if (!targetUserId || targetUserId === currentUserId) return "";
  const self = players.find((player) => player.userId === currentUserId);
  const target = players.find((player) => player.userId === targetUserId);
  if (!self || !target) return "";
  return self.team === target.team ? "对家" : "对手";
}

function isRedSuit(card: GuandanCard) {
  return card.suit === "hearts" || card.suit === "diamonds";
}

function splitCardDisplay(card: GuandanCard) {
  if (card.suit === "joker") {
    return card.rank === 16 ? ["大", "王"] : ["小", "王"];
  }
  const suitMap: Record<GuandanCard["suit"], string> = {
    spades: "♠",
    hearts: "♥",
    clubs: "♣",
    diamonds: "♦",
    joker: ""
  };
  const rankMap: Record<number, string> = {
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
    15: "小",
    16: "大"
  };
  return [suitMap[card.suit], rankMap[card.rank] ?? String(card.rank)];
}

function splitPlayedLabel(label: string) {
  if (label === "大王") return ["大", "王"];
  if (label === "小王") return ["小", "王"];
  if (label.startsWith("♠") || label.startsWith("♥") || label.startsWith("♣") || label.startsWith("♦")) {
    return [label.slice(0, 1), label.slice(1)];
  }
  return [label.slice(0, 1), label.slice(1)];
}

function bottomSort(cards: GuandanCard[], level: number) {
  return sortHand(cards, level);
}

function renderPlayedCardFace(parts: string[], fontSize: number) {
  return (
    <div
      style={{
        display: "grid",
        gap: 3,
        justifyItems: "center",
        alignContent: "center",
        minHeight: 28,
        width: "100%",
        justifyContent: "center",
        textAlign: "center"
      }}
    >
      {parts.map((part, index) => (
        <div
          key={`${part}-${index}`}
          style={{
            fontSize,
            fontWeight: 700,
            lineHeight: 1,
            width: "100%",
            textAlign: "center",
            display: "flex",
            justifyContent: "center"
          }}
        >
          {part}
        </div>
      ))}
    </div>
  );
}

function cardFaceStyle(params: {
  selected: boolean;
  enabled: boolean;
  width: number;
  height: number;
  color: string;
  radius: number;
  padding: string;
}) {
  return {
    width: params.width,
    minWidth: params.width,
    height: params.height,
    borderRadius: params.radius,
    border: params.selected ? "1px solid rgba(220,38,38,0.62)" : "1px solid rgba(203,213,225,0.7)",
    background: params.selected
      ? "linear-gradient(160deg, rgba(239,68,68,0.22), rgba(220,38,38,0.12))"
      : "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.64))",
    color: params.color,
    padding: params.padding,
    cursor: params.enabled ? "pointer" : "default",
    opacity: params.enabled ? 1 : 0.38
  } as const;
}

export function GuandanWidget({
  definition,
  instance: _instance,
  isMobileMode = false,
  onStateChange: _onStateChange
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
  const [matches, setMatches] = useState<GuandanMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [arrangedCardIds, setArrangedCardIds] = useState<string[]>([]);

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
          setOnlineError(toGuandanOnlineError(error).message);
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
              prev.length !== nextMatches.length ||
              prev.some((match, index) => match.id !== nextMatches[index]?.id || match.revision !== nextMatches[index]?.revision);
            return changed ? nextMatches : prev;
          });
        })
        .catch(() => {});
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [userId]);

  const pendingMatch = useMemo(() => matches.find((match) => match.status === "pending") ?? null, [matches]);
  const activeMatch = useMemo(() => matches.find((match) => match.status === "active") ?? null, [matches]);
  const completedMatch = useMemo(
    () => matches.find((match) => match.status === "completed" || match.status === "cancelled") ?? null,
    [matches]
  );
  const currentMatch = activeMatch ?? pendingMatch ?? completedMatch;
  const seatDisplays = useMemo(() => buildSeatDisplays(currentMatch, userId), [currentMatch, userId]);
  const selfPlayer = activeMatch?.state.players.find((player) => player.userId === userId) ?? null;
  const currentRequirement = pendingRequirementForUser(activeMatch, userId);
  const ownHand = useMemo(
    () => sortHand(selfPlayer?.hand ?? [], activeMatch?.state.currentLevel ?? 2),
    [selfPlayer?.hand, activeMatch?.state.currentLevel]
  );
  const arrangedCards = arrangedCardIds
    .map((cardId) => ownHand.find((card) => card.id === cardId))
    .filter(Boolean) as GuandanCard[];
  const bottomCards = bottomSort(
    ownHand.filter((card) => !arrangedCardIds.includes(card.id)),
    activeMatch?.state.currentLevel ?? 2
  );
  const tributeCandidates = useMemo(
    () => eligibleTributeCards(selfPlayer, activeMatch?.state.currentLevel ?? 2).map((card) => card.id),
    [selfPlayer, activeMatch?.state.currentLevel]
  );
  const returnCandidates = useMemo(
    () => eligibleReturnCards(selfPlayer, activeMatch?.state.currentLevel ?? 2).map((card) => card.id),
    [selfPlayer, activeMatch?.state.currentLevel]
  );
  const selectedCards = ownHand.filter((card) => selectedCardIds.includes(card.id));
  const selectedCombo = activeMatch ? detectCombo(selectedCards, activeMatch.state.currentLevel) : null;
  const selectedInTop = selectedCardIds.filter((cardId) => arrangedCardIds.includes(cardId));
  const selectedInBottom = selectedCardIds.filter((cardId) => !arrangedCardIds.includes(cardId));
  const currentTurnPlayerId = activeMatch?.state.currentTurnPlayerId ?? "";
  const currentTrickCombo = activeMatch?.state.currentTrick.currentCombo ?? null;
  const canPlay =
    activeMatch?.phase === "playing" &&
    currentTurnPlayerId === userId &&
    selectedCardIds.length > 0 &&
    Boolean(selectedCombo) &&
    !busyId;
  const canPass =
    activeMatch?.phase === "playing" &&
    currentTurnPlayerId === userId &&
    Boolean(currentTrickCombo) &&
    !busyId;
  const canSubmitTribute = Boolean(currentRequirement && selectedCardIds.length === 1 && !busyId);
  const canArrange = selectedCardIds.length > 0 && !busyId;
  const lastNonPass = activeMatch?.state.currentTrick.plays.slice().reverse().find((play) => !play.passed && play.combo) ?? null;
  const trickEvents = activeMatch?.state.currentTrick.plays.slice(-6).reverse() ?? [];
  const currentStatusText = onlineError || (loadingMatches ? "正在同步房间..." : getStatusText(currentMatch, userId));
  const isMyTurn = currentTurnPlayerId === userId;
  const inviteableUsers = otherUsers.slice(0, 20);
  const boardPanelHeight = isMobileMode ? 150 : 188;
  const teammatePanelHeight = isMobileMode ? 74 : 88;
  const lastPlayRelationLabel = relationLabelForUser(seatDisplays, userId, lastNonPass?.playerId);

  useEffect(() => {
    setSelectedCardIds((prev) => prev.filter((cardId) => ownHand.some((card) => card.id === cardId)));
    setArrangedCardIds((prev) => prev.filter((cardId) => ownHand.some((card) => card.id === cardId)));
  }, [ownHand]);

  const runOnlineAction = async (actionId: string, task: () => Promise<GuandanMatch>) => {
    setBusyId(actionId);
    setOnlineError("");
    try {
      const next = await task();
      setMatches((prev) => upsertMatchList(prev, next));
    } catch (error) {
      setOnlineError(toGuandanOnlineError(error, "在线操作失败").message);
    } finally {
      setBusyId("");
    }
  };

  const createLobby = () => {
    const invitees = selectedInviteIds
      .map((inviteeId) => otherUsers.find((entry) => entry.userId === inviteeId))
      .filter(Boolean)
      .map((entry) => ({ userId: entry!.userId, userName: entry!.userName }));
    if (invitees.length !== 3) {
      setOnlineError("请恰好选择 3 名在线用户");
      return;
    }
    setSelectedInviteIds([]);
    void runOnlineAction("create-guandan-room", () =>
      createOnlineMatch({
        hostUserId: userId,
        hostUserName: userName,
        invitees
      })
    );
  };

  const toggleCard = (cardId: string) => {
    const selectable =
      currentRequirement?.status === "pending_tribute"
        ? tributeCandidates.includes(cardId)
        : currentRequirement?.status === "pending_return"
          ? returnCandidates.includes(cardId)
          : true;
    if (!selectable) return;
    setSelectedCardIds((prev) => (prev.includes(cardId) ? prev.filter((item) => item !== cardId) : [...prev, cardId]));
  };

  const handleArrange = () => {
    setArrangedCardIds((prev) => {
      const remainingTop = prev.filter((cardId) => !selectedInTop.includes(cardId));
      const movingUp = selectedInBottom.filter((cardId) => !prev.includes(cardId));
      return [...remainingTop, ...movingUp];
    });
    setSelectedCardIds([]);
  };

  const handlePrimaryAction = () => {
    if (!activeMatch || !currentRequirement || selectedCardIds.length !== 1) return;
    const cardId = selectedCardIds[0]!;
    void runOnlineAction(`${currentRequirement.status}:${cardId}`, () => submitOnlineTribute(activeMatch, { userId, cardId }));
  };

  const handCardWidth = isMobileMode ? 22 : 24;
  const handCardHeight = isMobileMode ? 47 : 47;
  const cardRadius = isMobileMode ? 5 : 6;
  const handCardPadding = "10px 4px";
  const cardLabelFontSize = isMobileMode ? 11 : 12;
  const handRowMinHeight = handCardHeight + (isMobileMode ? 10 : 12);
  const handPanelMinHeight = handCardHeight * 2 + (isMobileMode ? 86 : 92);

  return (
    <Card
      title={definition.name}
      tone="peach"
      style={{
        height: "auto",
        minHeight: 0,
        padding: isMobileMode ? "8px 10px" : 10
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <div
            style={{
              fontSize: isMobileMode ? 11 : 12,
              color: isMyTurn ? "#dc2626" : "#475569",
              minHeight: 18,
              fontWeight: isMyTurn ? 700 : 500
            }}
          >
            {currentStatusText}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!currentMatch ? (
              <button type="button" style={actionButton(false, true)} onClick={createLobby}>
                邀请开局
              </button>
            ) : null}
            {pendingMatch && pendingMatch.hostUserId === userId ? (
              <>
                <button
                  type="button"
                  style={actionButton(Boolean(busyId), true)}
                  disabled={Boolean(busyId) || pendingMatch.state.invites.some((invite) => invite.status !== "accepted")}
                  onClick={() => void runOnlineAction(`start:${pendingMatch.id}`, () => startOnlineMatch(pendingMatch, userId))}
                >
                  开始
                </button>
                <button
                  type="button"
                  style={actionButton(Boolean(busyId))}
                  disabled={Boolean(busyId)}
                  onClick={() => void runOnlineAction(`cancel:${pendingMatch.id}`, () => cancelOnlineMatch(pendingMatch, userId))}
                >
                  取消
                </button>
              </>
            ) : null}
            {pendingMatch && pendingMatch.hostUserId !== userId ? (
              <>
                <button
                  type="button"
                  style={actionButton(Boolean(busyId), true)}
                  disabled={Boolean(busyId)}
                  onClick={() => void runOnlineAction(`accept:${pendingMatch.id}`, () => acceptOnlineMatch(pendingMatch, userId))}
                >
                  接受
                </button>
                <button
                  type="button"
                  style={actionButton(Boolean(busyId))}
                  disabled={Boolean(busyId)}
                  onClick={() => void runOnlineAction(`decline:${pendingMatch.id}`, () => declineOnlineMatch(pendingMatch, userId))}
                >
                  拒绝
                </button>
              </>
            ) : null}
            {currentMatch ? (
              <button
                type="button"
                style={actionButton(Boolean(busyId))}
                disabled={Boolean(busyId)}
                onClick={() =>
                  currentMatch &&
                  void runOnlineAction(`exit:${currentMatch.id}`, () => abandonOnlineMatch(currentMatch, userId))
                }
              >
                退出房间
              </button>
            ) : null}
            {completedMatch?.hostUserId === userId ? (
              <button
                type="button"
                style={actionButton(Boolean(busyId))}
                disabled={Boolean(busyId)}
                onClick={() => void runOnlineAction(`restart:${completedMatch.id}`, () => restartOnlineMatch(completedMatch, userId))}
              >
                原班再来
              </button>
            ) : null}
          </div>
        </div>

        {!currentMatch ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobileMode ? "1fr" : "1fr 1fr",
              gap: 8,
              padding: 8,
              borderRadius: 14,
              background: "linear-gradient(160deg, rgba(255,255,255,0.58), rgba(255,255,255,0.22))"
            }}
          >
            {inviteableUsers.length > 0 ? (
              inviteableUsers.map((entry) => {
                const selected = selectedInviteIds.includes(entry.userId);
                return (
                  <button
                    key={entry.userId}
                    type="button"
                    onClick={() =>
                      setSelectedInviteIds((prev) => {
                        if (prev.includes(entry.userId)) return prev.filter((item) => item !== entry.userId);
                        if (prev.length >= 3) return prev;
                        return [...prev, entry.userId];
                      })
                    }
                    style={{
                      borderRadius: 12,
                      border: selected ? "1px solid rgba(220,38,38,0.45)" : "1px solid rgba(148,163,184,0.34)",
                      background: selected
                        ? "linear-gradient(160deg, rgba(239,68,68,0.16), rgba(220,38,38,0.12))"
                        : "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.3))",
                      padding: "10px 12px",
                      textAlign: "left",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{entry.userName}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{selected ? "已选中" : "点击邀请"}</div>
                  </button>
                );
              })
            ) : (
              <div style={{ fontSize: 12, color: "#64748b" }}>暂无足够在线用户，至少需要 3 名其他玩家。</div>
            )}
          </div>
        ) : null}

        {currentMatch ? (
          <>
            <div
              style={{
                display: "grid",
                gap: 8,
                minHeight: teammatePanelHeight + boardPanelHeight + 18,
                flex: 1
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                  gridTemplateRows: `${teammatePanelHeight}px ${boardPanelHeight}px`,
                  gap: 8,
                  borderRadius: 16,
                  padding: 10,
                  background: "linear-gradient(160deg, rgba(15,23,42,0.08), rgba(15,23,42,0.02))",
                  position: "relative"
                }}
              >
                {activeMatch ? (
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      left: 10,
                      display: "grid",
                      gap: 2,
                      justifyItems: "start",
                      pointerEvents: "none"
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.15 }}>第 {activeMatch.state.currentRound} 局</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.15 }}>
                      当前打 {activeMatch.state.currentLevel === 14 ? "A" : activeMatch.state.currentLevel}
                    </div>
                  </div>
                ) : null}
                {[1, 2, 3].map((slot) => {
                  const player = getSeatPlayer(seatDisplays, userId, slot as 0 | 1 | 2 | 3);
                  const current = activeMatch?.state.currentTurnPlayerId === player?.userId;
                  const teammate = player && seatDisplays.find((item) => item.userId === userId)?.team === player.team;
                  return (
                    <div
                      key={slot}
                      style={{
                        ...playerSlotStyle(slot as 0 | 1 | 2 | 3),
                        borderRadius: 14,
                        padding: "4px 6px",
                        minWidth: 0,
                        height: teammate ? teammatePanelHeight : boardPanelHeight,
                        boxSizing: "border-box",
                        display: "grid",
                        justifyItems: "center",
                        alignContent: "center",
                        textAlign: "center",
                        overflow: "hidden",
                        alignSelf: "start",
                        background: current
                          ? "linear-gradient(160deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))"
                          : "linear-gradient(160deg, rgba(255,255,255,0.52), rgba(255,255,255,0.24))",
                        border: teammate ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(148,163,184,0.26)"
                      }}
                    >
                      <div
                        style={{
                          display: teammate ? "flex" : "grid",
                          gap: teammate ? 6 : 2,
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          minWidth: 0
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: userDisplayColor(player?.userId, player?.userName),
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: teammate ? "calc(100% - 34px)" : "100%",
                            width: "100%"
                          }}
                        >
                          {player?.userName ?? "等待中"}
                        </div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>
                        {player?.handCount !== null && player?.handCount !== undefined ? `${player.handCount} 张` : "等待中"}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 10, color: "#64748b" }}>{player?.waitingText ?? "等待中"}</div>
                        {player?.reportedCount ? <div style={{ fontSize: 10, color: "#b45309" }}>报 {player.reportedCount}</div> : null}
                        {player?.finishOrder ? <div style={{ fontSize: 10, color: "#0f766e" }}>第 {player.finishOrder} 名</div> : null}
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{
                    gridColumn: "2 / span 3",
                    gridRow: 2,
                    borderRadius: 16,
                    padding: 12,
                    height: boardPanelHeight,
                    boxSizing: "border-box",
                    display: "grid",
                    gap: 6,
                    gridTemplateRows: "auto auto auto 1fr auto",
                    overflowY: "auto",
                    background: "linear-gradient(165deg, rgba(255,255,255,0.55), rgba(255,255,255,0.22))"
                  }}
                >
                  <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>
                    {lastNonPass
                      ? `${lastPlayRelationLabel ? `${lastPlayRelationLabel} ` : ""}${lastNonPass.text}`
                      : currentMatch.status === "pending"
                        ? "房间已创建，等待所有玩家进入"
                        : "等待首家出牌"}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minHeight: 42 }}>
                    {(lastNonPass?.cardLabels ?? []).map((label, index) => {
                      const parts = splitPlayedLabel(label);
                      const isRed = parts[0] === "♥" || parts[0] === "♦";
                      return (
                        <span
                          key={`${label}-${index}`}
                          style={{
                            ...cardFaceStyle({
                              selected: false,
                              enabled: true,
                              width: handCardWidth,
                              height: handCardHeight,
                              color: isRed ? "#b91c1c" : "#0f172a",
                              radius: cardRadius,
                              padding: handCardPadding
                            }),
                            display: "grid",
                            justifyItems: "center",
                            alignContent: "center",
                            gap: 3
                          }}
                        >
                          {renderPlayedCardFace(parts, cardLabelFontSize)}
                        </span>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                      alignSelf: "end"
                    }}
                  >
                    {(activeMatch ? trickEvents : []).length > 0 ? (
                      trickEvents.map((item, index) => (
                        <span
                          key={`${item.createdAt}-${index}`}
                          style={{
                            fontSize: 11,
                            color: "#475569",
                            lineHeight: 1.45
                          }}
                        >
                          {item.text}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        {currentMatch.status === "pending" ? "牌桌已打开，未到玩家会显示等待中。" : "本轮还没有新的出牌记录。"}
                      </span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                padding: 10,
                borderRadius: 16,
                minHeight: handPanelMinHeight,
                background: isMyTurn
                  ? "linear-gradient(160deg, rgba(254,226,226,0.92), rgba(248,113,113,0.34))"
                  : "linear-gradient(160deg, rgba(255,255,255,0.42), rgba(255,255,255,0.18))"
              }}
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: userDisplayColor(userId, userName),
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: isMobileMode ? "100%" : 120,
                    marginRight: 2
                  }}
                  title={userName}
                >
                  {userName}
                </div>
                {currentRequirement ? (
                  <button
                    type="button"
                    style={actionButton(!canSubmitTribute, isMyTurn)}
                    disabled={!canSubmitTribute}
                    onClick={handlePrimaryAction}
                  >
                    {currentRequirement.status === "pending_tribute" ? "提交贡牌" : "提交还贡"}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      style={actionButton(!canPlay, isMyTurn)}
                      disabled={!canPlay}
                      onClick={() =>
                        activeMatch &&
                        void runOnlineAction(`play:${activeMatch.id}`, () => submitOnlinePlay(activeMatch, { userId, cardIds: selectedCardIds }))
                      }
                    >
                      出牌
                    </button>
                    <button
                      type="button"
                      style={actionButton(!canPass)}
                      disabled={!canPass}
                      onClick={() => activeMatch && void runOnlineAction(`pass:${activeMatch.id}`, () => passOnlineTurn(activeMatch, userId))}
                    >
                      过牌
                    </button>
                  </>
                )}
                <button type="button" style={actionButton(!canArrange)} disabled={!canArrange} onClick={handleArrange}>
                  理牌
                </button>
                <button type="button" style={actionButton(selectedCardIds.length === 0)} disabled={selectedCardIds.length === 0} onClick={() => setSelectedCardIds([])}>
                  重选
                </button>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", gap: 2, minHeight: handRowMinHeight, overflowX: "auto", alignItems: "flex-end" }}>
                  {arrangedCards.length === 0 ? <div style={{ minHeight: 1 }} /> : null}
                  {arrangedCards.map((card) => {
                    const selected = selectedCardIds.includes(card.id);
                    const enabled =
                      currentRequirement?.status === "pending_tribute"
                        ? tributeCandidates.includes(card.id)
                        : currentRequirement?.status === "pending_return"
                          ? returnCandidates.includes(card.id)
                          : true;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={!enabled}
                        onClick={() => toggleCard(card.id)}
                        style={{
                          ...cardFaceStyle({
                            selected,
                            enabled,
                            width: handCardWidth,
                            height: handCardHeight,
                            color: isRedSuit(card) ? "#b91c1c" : "#0f172a",
                            radius: cardRadius,
                            padding: handCardPadding
                          }),
                          transform: selected ? "translateY(-4px)" : "translateY(0)"
                        }}
                      >
                        {renderPlayedCardFace(splitCardDisplay(card), cardLabelFontSize)}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 2, minHeight: handRowMinHeight, overflowX: "auto", alignItems: "flex-end" }}>
                  {bottomCards.map((card) => {
                    const selected = selectedCardIds.includes(card.id);
                    const enabled =
                      currentRequirement?.status === "pending_tribute"
                        ? tributeCandidates.includes(card.id)
                        : currentRequirement?.status === "pending_return"
                          ? returnCandidates.includes(card.id)
                          : true;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={!enabled}
                        onClick={() => toggleCard(card.id)}
                        style={{
                          ...cardFaceStyle({
                            selected,
                            enabled,
                            width: handCardWidth,
                            height: handCardHeight,
                            color: isRedSuit(card) ? "#b91c1c" : "#0f172a",
                            radius: cardRadius,
                            padding: handCardPadding
                          }),
                          transform: selected ? "translateY(-4px)" : "translateY(0)"
                        }}
                      >
                        {renderPlayedCardFace(splitCardDisplay(card), cardLabelFontSize)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
