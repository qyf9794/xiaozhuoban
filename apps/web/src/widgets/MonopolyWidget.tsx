import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { Card } from "@xiaozhuoban/ui";
import { useAuthStore } from "../auth/authStore";
import { resolveUserName } from "../lib/collab";
import {
  MONOPOLY_BOARD_SIDE,
  MONOPOLY_MAX_INVITEES,
  MONOPOLY_MAX_ROUNDS,
  MONOPOLY_PASS_START_REWARD,
  MONOPOLY_TILES,
  upsertMatchList,
  type MonopolyInvite,
  type MonopolyMatch,
  type MonopolyPlayerState
} from "../lib/monopoly";
import {
  acceptOnlineMatch,
  cancelOnlineMatch,
  createOnlineMatch,
  declineOnlineMatch,
  endOnlineTurn,
  listRelevantMatches,
  purchaseOnlineProperty,
  removeMatchChannel,
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
    return winner ? `${winner.userName} 以 ${winner.totalAssets} 资产领先结束对局` : "对局已结束";
  }
  if (match.phase === "await_purchase_decision") {
    const decision = match.state.pendingDecision;
    const currentPlayer = getCurrentPlayer(match);
    if (decision?.playerId === userId) {
      return "你停在空地产，可选择购买或跳过";
    }
    return `等待 ${currentPlayer?.userName ?? "当前玩家"} 决定是否购买地产`;
  }
  if (match.phase === "await_roll" && match.state.turnStep === "roll") {
    const currentPlayer = getCurrentPlayer(match);
    return currentPlayer?.userId === userId ? "轮到你掷骰" : `等待 ${currentPlayer?.userName ?? "当前玩家"} 掷骰`;
  }
  if (match.phase === "await_roll" && match.state.turnStep === "end") {
    const currentPlayer = getCurrentPlayer(match);
    return currentPlayer?.userId === userId ? "本回合已结算，点击结束回合" : `等待 ${currentPlayer?.userName ?? "当前玩家"} 结束回合`;
  }
  return match.state.lastEvent || "房间同步中";
}

function cardBackStyle(kind: "chance" | "fate"): CSSProperties {
  const palette =
    kind === "chance"
      ? {
          background: "linear-gradient(145deg, rgba(34,197,94,0.92), rgba(22,163,74,0.82))",
          shadow: "0 14px 26px rgba(22,163,74,0.16)"
        }
      : {
          background: "linear-gradient(145deg, rgba(249,115,22,0.92), rgba(234,88,12,0.82))",
          shadow: "0 14px 26px rgba(249,115,22,0.14)"
        };
  return {
    width: 78,
    height: 104,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.36)",
    background: palette.background,
    boxShadow: palette.shadow,
    color: "#fff7ed",
    fontSize: 15,
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

function getAssetSummary(player: MonopolyPlayerState | null) {
  if (!player) return "尚未入局";
  return `现金 ${player.cash} · 地产 ${player.propertyIds.length}`;
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
  const selfPlayer = getPlayerDisplay(activeMatch ?? completedMatch, userId);
  const currentPlayer = getCurrentPlayer(activeMatch);
  const statusText = onlineError || (loadingMatches ? "正在同步房间..." : getStatusText(currentMatch, userId));
  const hostAcceptedCount = pendingMatch?.state.invites.filter((invite) => invite.status === "accepted").length ?? 0;
  const canHostStart = Boolean(pendingMatch && pendingMatch.hostUserId === userId && hostAcceptedCount >= 1);
  const canRoll = Boolean(activeMatch && activeMatch.phase === "await_roll" && activeMatch.state.turnStep === "roll" && isCurrentPlayer(activeMatch, userId));
  const canBuy = Boolean(
    activeMatch &&
      activeMatch.phase === "await_purchase_decision" &&
      activeMatch.state.pendingDecision?.playerId === userId &&
      isCurrentPlayer(activeMatch, userId)
  );
  const canEndTurn = Boolean(
    activeMatch && activeMatch.phase === "await_roll" && activeMatch.state.turnStep === "end" && isCurrentPlayer(activeMatch, userId)
  );
  const inviteableUsers = useMemo(() => otherUsers.slice(0, 20), [otherUsers]);
  const latestEvent = currentMatch?.state.lastEvent || "大厅已就绪";
  const topRanking = (activeMatch ?? completedMatch)?.state.ranking.slice(0, 4) ?? [];
  const currentDice = activeMatch?.state.lastRoll?.dice ?? completedMatch?.state.lastRoll?.dice ?? null;

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

  const cardPadding = isMobileMode ? "8px 12px 6px" : 8;
  const sectionGap = isMobileMode ? 6 : 8;

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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: sectionGap,
            alignItems: "start"
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: isMobileMode ? 16 : 18, fontWeight: 700, color: "#0f172a" }}>在线房间</div>
            <div style={{ fontSize: isMobileMode ? 11 : 12, color: "#475569", minHeight: 16 }}>{statusText}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              轮数上限 {MONOPOLY_MAX_ROUNDS} · 过起点奖励 {MONOPOLY_PASS_START_REWARD}
            </div>
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
            {invitePickerOpen ? (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  zIndex: 6,
                  width: isMobileMode ? 240 : 260,
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
                        <span style={{ fontSize: 12 }}>{entry.userName}</span>
                        <span style={{ fontSize: 10, color: "#64748b" }}>在线</span>
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
              padding: isMobileMode ? 8 : 10,
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
              borderRadius: 20,
              padding: 6,
              gap: 4,
              background: "linear-gradient(150deg, rgba(219,239,236,0.96), rgba(204,228,223,0.94))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -10px 24px rgba(15,23,42,0.06)"
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
                        display: "grid",
                        gap: isMobileMode ? 8 : 12,
                        alignContent: "space-between",
                        padding: isMobileMode ? 10 : 14,
                        borderRadius: 18,
                        background:
                          "linear-gradient(160deg, rgba(255,255,255,0.54), rgba(255,255,255,0.18)), radial-gradient(circle at top, rgba(125,211,252,0.25), rgba(255,255,255,0))",
                        border: "1px solid rgba(255,255,255,0.42)"
                      }}
                    >
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: isMobileMode ? 13 : 15, fontWeight: 700, color: "#0f172a" }}>
                              {activeMatch ? `第 ${activeMatch.state.currentRound} / ${MONOPOLY_MAX_ROUNDS} 轮` : "等待开局"}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                              {currentPlayer ? `当前玩家：${currentPlayer.userName}` : "房主邀请后开始"}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: "#64748b" }}>我的资产</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{getAssetSummary(selfPlayer)}</div>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 10,
                            alignItems: "center",
                            borderRadius: 16,
                            padding: "10px 12px",
                            background: "rgba(255,255,255,0.58)"
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>最近事件</div>
                            <div style={{ fontSize: isMobileMode ? 12 : 13, lineHeight: 1.45, color: "#0f172a", marginTop: 2 }}>
                              {latestEvent}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                              minWidth: 92,
                              justifyContent: "flex-end"
                            }}
                          >
                            {currentDice ? (
                              currentDice.map((value, index) => (
                                <div
                                  key={`${value}-${index}`}
                                  style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 12,
                                    background: "linear-gradient(160deg, rgba(255,255,255,0.96), rgba(226,232,240,0.92))",
                                    border: "1px solid rgba(148,163,184,0.32)",
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: "#0f172a"
                                  }}
                                >
                                  {value}
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>骰子待掷</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <div style={{ display: "flex", gap: isMobileMode ? 8 : 14, alignItems: "center" }}>
                          <div style={cardBackStyle("chance")}>机会</div>
                          <div style={cardBackStyle("fate")}>命运</div>
                        </div>
                        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                          {canRoll ? (
                            <button
                              type="button"
                              style={actionButtonStyle(Boolean(busyId), true)}
                              disabled={Boolean(busyId)}
                              onClick={() => activeMatch && void runOnlineAction(`roll:${activeMatch.id}`, () => submitOnlineRoll(activeMatch, userId))}
                            >
                              掷骰
                            </button>
                          ) : null}
                          {canBuy ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                style={actionButtonStyle(Boolean(busyId), true)}
                                disabled={Boolean(busyId)}
                                onClick={() =>
                                  activeMatch && void runOnlineAction(`buy:${activeMatch.id}`, () => purchaseOnlineProperty(activeMatch, userId))
                                }
                              >
                                购买
                              </button>
                              <button
                                type="button"
                                style={actionButtonStyle(Boolean(busyId))}
                                disabled={Boolean(busyId)}
                                onClick={() =>
                                  activeMatch && void runOnlineAction(`skip:${activeMatch.id}`, () => skipOnlineProperty(activeMatch, userId))
                                }
                              >
                                跳过
                              </button>
                            </div>
                          ) : null}
                          {canEndTurn ? (
                            <button
                              type="button"
                              style={actionButtonStyle(Boolean(busyId), true)}
                              disabled={Boolean(busyId)}
                              onClick={() =>
                                activeMatch && void runOnlineAction(`end:${activeMatch.id}`, () => endOnlineTurn(activeMatch, userId))
                              }
                            >
                              结束回合
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 6,
                          padding: "9px 10px",
                          borderRadius: 16,
                          background: "rgba(15,23,42,0.06)"
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>资产榜</div>
                        {topRanking.length > 0 ? (
                          topRanking.map((entry, index) => (
                            <div
                              key={entry.userId}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "auto 1fr auto",
                                gap: 8,
                                alignItems: "center",
                                fontSize: 11,
                                color: "#0f172a"
                              }}
                            >
                              <span style={{ color: "#64748b" }}>#{index + 1}</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {entry.userName}
                              </span>
                              <span>{entry.totalAssets}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>开局后显示资产榜</div>
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
                const playersOnTile = getPlayersOnTile(activeMatch ?? completedMatch, tile.index);
                const ownerUserId = activeMatch?.state.propertyOwners[String(tile.index)] ?? completedMatch?.state.propertyOwners[String(tile.index)];
                const ownerPlayer = (activeMatch ?? completedMatch)?.state.players.find((player) => player.userId === ownerUserId);
                const isCorner = tile.kind === "corner";

                return (
                  <div
                    key={tileCellKey(row, col)}
                    style={{
                      position: "relative",
                      display: "grid",
                      alignContent: "space-between",
                      padding: isMobileMode ? 6 : 7,
                      borderRadius: isCorner ? 16 : 12,
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: isCorner
                        ? "linear-gradient(150deg, rgba(255,250,240,0.96), rgba(255,237,213,0.9))"
                        : "linear-gradient(160deg, rgba(255,255,255,0.92), rgba(248,250,252,0.86))",
                      overflow: "hidden"
                    }}
                  >
                    {tile.color ? (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          height: 7,
                          background: tile.color
                        }}
                      />
                    ) : null}
                    <div style={{ display: "grid", gap: 3, marginTop: tile.color ? 6 : 0 }}>
                      <div style={{ fontSize: isMobileMode ? 9 : 10, fontWeight: 700, color: "#0f172a", lineHeight: 1.15 }}>
                        {tile.shortName}
                      </div>
                      <div style={{ fontSize: 9, color: "#64748b", lineHeight: 1.1 }}>
                        {tile.price ? `${tile.price} / 租 ${tile.rent}` : tile.badge ?? tile.name}
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 4 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 10px)", gap: 3 }}>
                        {playersOnTile.slice(0, 4).map((player) => (
                          <span
                            key={player.userId}
                            title={player.userName}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: player.color,
                              boxShadow: "0 0 0 2px rgba(255,255,255,0.82)"
                            }}
                          />
                        ))}
                      </div>
                      {ownerPlayer ? (
                        <span
                          style={{
                            minWidth: 16,
                            height: 16,
                            borderRadius: 999,
                            background: ownerPlayer.color,
                            color: "#fff",
                            fontSize: 9,
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 700
                          }}
                          title={ownerPlayer.userName}
                        >
                          {ownerPlayer.seat + 1}
                        </span>
                      ) : null}
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
