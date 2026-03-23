import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { Button, Card } from "@xiaozhuoban/ui";
import { useAuthStore } from "../auth/authStore";
import { resolveUserName } from "../lib/collab";
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

function actionButton(disabled = false, emphasis = false) {
  return {
    border: emphasis ? "1px solid rgba(14,165,233,0.48)" : "1px solid rgba(148,163,184,0.34)",
    borderRadius: 10,
    padding: "6px 10px",
    fontSize: 11,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.56 : 1,
    background: emphasis
      ? "linear-gradient(155deg, rgba(14,165,233,0.88), rgba(59,130,246,0.74))"
      : "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34))",
    color: emphasis ? "#eff6ff" : "#0f172a"
  } as const;
}

function playerSlotStyle(slot: 0 | 1 | 2 | 3) {
  if (slot === 0) return { gridColumn: "2 / span 3", gridRow: 3 };
  if (slot === 1) return { gridColumn: 5, gridRow: 2 };
  if (slot === 2) return { gridColumn: "2 / span 3", gridRow: 1 };
  return { gridColumn: 1, gridRow: 2 };
}

function cardLabel(card: GuandanCard) {
  return card.label || `${card.suit}-${card.rank}`;
}

function getSeatPlayer(players: GuandanPlayerState[], currentUserId: string, targetSlot: 0 | 1 | 2 | 3) {
  const self = players.find((player) => player.userId === currentUserId);
  if (!self) return null;
  const targetSeat = (self.seat + targetSlot) % 4;
  return players.find((player) => player.seat === targetSeat) ?? null;
}

function getStatusText(match: GuandanMatch | null, userId: string) {
  if (!match) return "邀请 3 名在线用户创建 4 人房间";
  if (match.status === "pending") {
    if (match.hostUserId === userId) {
      const accepted = match.state.invites.filter((invite) => invite.status === "accepted").length;
      return accepted === 3 ? "4 人已到齐，可开始发牌" : `已确认 ${accepted}/3，等待其余玩家接受`;
    }
    const invite = match.state.invites.find((item) => item.userId === userId);
    return invite?.status === "accepted" ? "你已接受邀请，等待房主开始" : "收到掼蛋邀请，确认后加入房间";
  }
  if (match.status === "completed") {
    return match.state.lastEvent || "整场已结束，可由房主重新开局";
  }
  if (match.status === "cancelled") {
    return "房间已取消，可由房主重新开始";
  }
  if (match.phase === "tribute") {
    return match.state.lastEvent || "正在贡还牌";
  }
  if (match.phase === "playing") {
    const current = match.state.players.find((player) => player.userId === match.state.currentTurnPlayerId);
    return current?.userId === userId ? "轮到你操作" : `等待 ${current?.userName ?? "其他玩家"} 出牌`;
  }
  return match.state.lastEvent || "房间同步中";
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
  const invitePickerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!invitePickerRef.current?.contains(event.target as Node)) {
        setSelectedInviteIds((prev) => (prev.length > 0 ? prev : prev));
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pendingMatch = useMemo(() => matches.find((match) => match.status === "pending") ?? null, [matches]);
  const activeMatch = useMemo(() => matches.find((match) => match.status === "active") ?? null, [matches]);
  const completedMatch = useMemo(() => matches.find((match) => match.status === "completed" || match.status === "cancelled") ?? null, [matches]);
  const currentMatch = activeMatch ?? pendingMatch ?? completedMatch;
  const selfPlayer = activeMatch ? activeMatch.state.players.find((player) => player.userId === userId) ?? null : null;
  const currentRequirement = pendingRequirementForUser(activeMatch, userId);
  const ownHand = useMemo(() => sortHand(selfPlayer?.hand ?? [], activeMatch?.state.currentLevel ?? 2), [selfPlayer?.hand, activeMatch?.state.currentLevel]);
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
  const canPlay =
    Boolean(activeMatch) &&
    activeMatch?.phase === "playing" &&
    activeMatch.state.currentTurnPlayerId === userId &&
    selectedCardIds.length > 0 &&
    Boolean(selectedCombo) &&
    !busyId;
  const canPass =
    Boolean(activeMatch) &&
    activeMatch?.phase === "playing" &&
    activeMatch.state.currentTurnPlayerId === userId &&
    Boolean(activeMatch.state.currentTrick.currentCombo) &&
    !busyId;

  useEffect(() => {
    setSelectedCardIds([]);
  }, [currentMatch?.id, currentMatch?.revision]);

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
    setSelectedCardIds((prev) => (prev.includes(cardId) ? prev.filter((item) => item !== cardId) : [...prev, cardId]));
  };

  const handlePrimaryAction = () => {
    if (!activeMatch || !currentRequirement || selectedCardIds.length !== 1) return;
    const cardId = selectedCardIds[0]!;
    void runOnlineAction(
      `${currentRequirement.status}:${cardId}`,
      () => submitOnlineTribute(activeMatch, { userId, cardId })
    );
  };

  const lastNonPass = activeMatch?.state.currentTrick.plays.find((play) => !play.passed && play.combo) ?? null;
  const inviteableUsers = otherUsers.slice(0, 20);
  const currentStatusText = onlineError || (loadingMatches ? "正在同步房间..." : getStatusText(currentMatch, userId));
  const desktopFont = isMobileMode ? 11 : 12;

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
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "start" }}>
          <div style={{ fontSize: desktopFont, color: "#475569", minHeight: 18 }}>{currentStatusText}</div>
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
            ref={invitePickerRef}
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
                        if (prev.includes(entry.userId)) {
                          return prev.filter((item) => item !== entry.userId);
                        }
                        if (prev.length >= 3) return prev;
                        return [...prev, entry.userId];
                      })
                    }
                    style={{
                      borderRadius: 12,
                      border: selected ? "1px solid rgba(14,165,233,0.55)" : "1px solid rgba(148,163,184,0.34)",
                      background: selected
                        ? "linear-gradient(160deg, rgba(14,165,233,0.2), rgba(59,130,246,0.18))"
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

        {pendingMatch ? (
          <div style={{ display: "grid", gap: 6, padding: 8, borderRadius: 14, background: "rgba(255,255,255,0.26)" }}>
            {pendingMatch.state.invites.map((invite) => (
              <div
                key={invite.userId}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#0f172a" }}
              >
                <span>{invite.userName}</span>
                <span style={{ color: "#64748b" }}>
                  {invite.status === "accepted" ? "已接受" : invite.status === "declined" ? "已拒绝" : "待确认"}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {activeMatch ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                alignItems: "center",
                padding: 8,
                borderRadius: 14,
                background: "linear-gradient(145deg, rgba(255,255,255,0.44), rgba(255,255,255,0.16))"
              }}
            >
              <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 700 }}>
                第 {activeMatch.state.currentRound} 局 · 当前打 {activeMatch.state.currentLevel === 14 ? "A" : activeMatch.state.currentLevel}
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>{activeMatch.phase === "tribute" ? "贡还牌" : "出牌中"}</div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.5fr 1fr 1.25fr",
                gap: 8,
                minHeight: isMobileMode ? 250 : 290,
                flex: 1
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                  gridTemplateRows: "auto 1fr auto",
                  gap: 8,
                  gridColumn: "1 / span 3",
                  borderRadius: 16,
                  padding: 10,
                  background: "linear-gradient(160deg, rgba(15,23,42,0.08), rgba(15,23,42,0.02))"
                }}
              >
                {[0, 1, 2, 3].map((slot) => {
                  const player = getSeatPlayer(activeMatch.state.players, userId, slot as 0 | 1 | 2 | 3);
                  const current = activeMatch.state.currentTurnPlayerId === player?.userId;
                  const teammate = player?.team === selfPlayer?.team;
                  return (
                    <div
                      key={slot}
                      style={{
                        ...playerSlotStyle(slot as 0 | 1 | 2 | 3),
                        borderRadius: 14,
                        padding: 8,
                        minWidth: 0,
                        background: current
                          ? "linear-gradient(160deg, rgba(14,165,233,0.22), rgba(59,130,246,0.12))"
                          : "linear-gradient(160deg, rgba(255,255,255,0.52), rgba(255,255,255,0.24))",
                        border: teammate ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(148,163,184,0.26)"
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{player?.userName ?? "空位"}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>
                        {player?.userId === userId ? "你" : teammate ? "对家" : "对手"} · {player?.handCount ?? 0} 张
                      </div>
                      {player?.reportedCount ? (
                        <div style={{ marginTop: 4, fontSize: 10, color: "#b45309" }}>报 {player.reportedCount}</div>
                      ) : null}
                      {player?.finishOrder ? (
                        <div style={{ marginTop: 4, fontSize: 10, color: "#0f766e" }}>第 {player.finishOrder} 名</div>
                      ) : null}
                    </div>
                  );
                })}

                <div
                  style={{
                    gridColumn: "2 / span 3",
                    gridRow: 2,
                    borderRadius: 16,
                    padding: 12,
                    minHeight: 118,
                    display: "grid",
                    gap: 8,
                    alignContent: "start",
                    background: "linear-gradient(165deg, rgba(255,255,255,0.55), rgba(255,255,255,0.22))"
                  }}
                >
                  <div style={{ fontSize: 11, color: "#64748b" }}>牌桌</div>
                  <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>
                    {lastNonPass?.text ?? "等待首家出牌"}
                  </div>
                  {activeMatch.state.currentTrick.currentCombo ? (
                    <div style={{ fontSize: 11, color: "#475569" }}>当前牌型：{activeMatch.state.currentTrick.currentCombo.display}</div>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(lastNonPass?.cardIds ?? []).map((cardId) => {
                      const card = activeMatch.state.players.flatMap((player) => player.hand).find((item) => item.id === cardId);
                      return (
                        <span
                          key={cardId}
                          style={{
                            borderRadius: 10,
                            padding: "4px 8px",
                            fontSize: 11,
                            color: "#0f172a",
                            background: "rgba(255,255,255,0.7)"
                          }}
                        >
                          {card ? cardLabel(card) : "已出牌"}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateRows: "auto auto 1fr auto",
                  gap: 8,
                  borderRadius: 16,
                  padding: 10,
                  background: "linear-gradient(160deg, rgba(255,255,255,0.44), rgba(255,255,255,0.18))"
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>操作区</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {selectedCombo ? `已选 ${selectedCombo.display}` : currentRequirement ? "请选择一张贡/还牌" : "请选择要出的牌"}
                </div>
                <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
                  {currentRequirement ? (
                    <Button onClick={handlePrimaryAction}>
                      {currentRequirement.status === "pending_tribute" ? "提交贡牌" : "提交还贡"}
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() => activeMatch && void runOnlineAction(`play:${activeMatch.id}`, () => submitOnlinePlay(activeMatch, { userId, cardIds: selectedCardIds }))}
                      >
                        出牌
                      </Button>
                      <button
                        type="button"
                        style={actionButton(!canPass)}
                        disabled={!canPass}
                        onClick={() => activeMatch && void runOnlineAction(`pass:${activeMatch.id}`, () => passOnlineTurn(activeMatch, userId))}
                      >
                        不出
                      </button>
                    </>
                  )}
                  <button type="button" style={actionButton(false)} onClick={() => setSelectedCardIds([])}>
                    清空选择
                  </button>
                  <button
                    type="button"
                    style={actionButton(Boolean(busyId))}
                    disabled={Boolean(busyId)}
                    onClick={() => activeMatch && void runOnlineAction(`exit:${activeMatch.id}`, () => abandonOnlineMatch(activeMatch, userId))}
                  >
                    退出房间
                  </button>
                </div>
                <div style={{ display: "grid", gap: 4, alignContent: "start", maxHeight: 210, overflow: "auto" }}>
                  {activeMatch.state.eventLog.slice(0, 8).map((item, index) => (
                    <div key={`${item}-${index}`} style={{ fontSize: 11, color: "#475569", lineHeight: 1.45 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                padding: 10,
                borderRadius: 16,
                background: "linear-gradient(160deg, rgba(255,255,255,0.42), rgba(255,255,255,0.18))"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>你的手牌</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {currentRequirement?.status === "pending_tribute"
                    ? "需选择最大可进贡单牌"
                    : currentRequirement?.status === "pending_return"
                      ? "需选择 10 及以下且非级牌"
                      : `共 ${ownHand.length} 张`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                {ownHand.map((card) => {
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
                        minWidth: isMobileMode ? 42 : 48,
                        borderRadius: 12,
                        border: selected ? "1px solid rgba(14,165,233,0.6)" : "1px solid rgba(203,213,225,0.7)",
                        background: selected
                          ? "linear-gradient(160deg, rgba(14,165,233,0.22), rgba(59,130,246,0.14))"
                          : "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.64))",
                        color: card.suit === "hearts" || card.label.startsWith("♦") ? "#b91c1c" : "#0f172a",
                        padding: "12px 6px",
                        cursor: enabled ? "pointer" : "default",
                        opacity: enabled ? 1 : 0.38,
                        transform: selected ? "translateY(-4px)" : "translateY(0)"
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{cardLabel(card)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
