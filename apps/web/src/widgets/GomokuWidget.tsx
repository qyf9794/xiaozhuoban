import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { Card } from "@xiaozhuoban/ui";
import { useAuthStore } from "../auth/authStore";
import { resolveUserName } from "../lib/collab";
import {
  applyMoveToMatch,
  BOARD_SIZE,
  chooseAiMove,
  createEmptyBoard,
  createInitialLocalGame,
  normalizeBoardState,
  type GomokuBoardState,
  type GomokuMatch,
  type GomokuWinner,
  type GomokuStone,
  stoneForUser,
  upsertMatchList
} from "../lib/gomoku";
import {
  acceptOnlineMatch,
  cancelOnlineMatch,
  createOnlineMatch,
  declineOnlineMatch,
  listRelevantMatches,
  removeMatchChannel,
  submitOnlineMove,
  subscribeToUserMatches
} from "../lib/gomokuOnline";
import { useOnlineUsers } from "../lib/useOnlineUsers";

type GomokuMode = "ai" | "online";
interface LocalGameState {
  boardState: GomokuBoardState;
  status: "playing" | "completed";
  currentTurn: GomokuStone;
  winner: GomokuWinner | null;
  movesCount: number;
  lastMove: { row: number; col: number; stone: GomokuStone } | null;
}

function normalizeMode(value: unknown): GomokuMode {
  return value === "online" ? "online" : "ai";
}

function normalizeWinner(value: unknown): GomokuWinner | null {
  if (value === "black" || value === "white" || value === "draw") {
    return value;
  }
  return null;
}

function normalizeLocalGame(value: unknown): LocalGameState {
  const fallback = createInitialLocalGame();
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const raw = value as Record<string, unknown>;
  return {
    boardState: normalizeBoardState(raw.boardState),
    status: raw.status === "completed" ? "completed" : "playing",
    currentTurn: raw.currentTurn === "white" ? "white" : "black",
    winner: normalizeWinner(raw.winner),
    movesCount: typeof raw.movesCount === "number" ? raw.movesCount : 0,
    lastMove:
      raw.lastMove && typeof raw.lastMove === "object"
        ? ((raw.lastMove as { row?: number; col?: number; stone?: GomokuStone })?.stone
            ? {
                row: Number((raw.lastMove as { row?: number }).row ?? 0),
                col: Number((raw.lastMove as { col?: number }).col ?? 0),
                stone: (raw.lastMove as { stone?: GomokuStone }).stone === "white" ? "white" : "black"
              }
            : null)
        : null
  };
}

function modeButtonStyle(active: boolean): CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.5)",
    borderRadius: 999,
    padding: "4px 10px",
    background: active
      ? "linear-gradient(155deg, rgba(37,99,235,0.82), rgba(14,165,233,0.72))"
      : "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34))",
    color: active ? "#eff6ff" : "#0f172a",
    fontSize: 11,
    cursor: "pointer",
    boxShadow: active ? "0 10px 18px rgba(37,99,235,0.2)" : "none"
  };
}

function actionButtonStyle(disabled = false): CSSProperties {
  return {
    border: "1px solid rgba(148,163,184,0.36)",
    borderRadius: 10,
    padding: "5px 8px",
    fontSize: 11,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    background: "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34))",
    color: "#0f172a"
  };
}

function winnerText(winner: GomokuMatch["winner"]) {
  if (winner === "black") return "黑棋获胜";
  if (winner === "white") return "白棋获胜";
  if (winner === "draw") return "平局";
  return "";
}

function statusTextForOnlineMatch(match: GomokuMatch | null, userId: string) {
  if (!match) return "选择在线用户发起邀请";
  if (match.status === "pending") {
    return match.guestUserId === userId ? "收到邀请，确认后开始对局" : "邀请已发出，等待对方确认";
  }
  if (match.status === "completed") {
    return winnerText(match.winner);
  }
  const playerStone = stoneForUser(match, userId);
  if (!playerStone) return "当前用户不在该对局中";
  return match.currentTurn === playerStone ? "轮到你落子" : "等待对手落子";
}

function localStatusText(localGame: LocalGameState) {
  if (localGame.status === "completed") {
    return winnerText(localGame.winner);
  }
  return localGame.currentTurn === "white" ? "AI 思考中..." : "你执黑先手";
}

export function GomokuWidget({
  definition,
  instance,
  isMobileMode = false,
  onStateChange
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
  const mode = normalizeMode(instance.state.gomokuMode);
  const localGame = normalizeLocalGame(instance.state.gomokuLocalGame);
  const [matches, setMatches] = useState<GomokuMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [busyId, setBusyId] = useState("");
  const aiTimerRef = useRef<number | null>(null);

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
          setOnlineError(error instanceof Error ? error.message : "在线对局加载失败");
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
    if (mode !== "ai") return;
    if (localGame.status !== "playing" || localGame.currentTurn !== "white") return;
    if (aiTimerRef.current !== null) {
      window.clearTimeout(aiTimerRef.current);
    }
    aiTimerRef.current = window.setTimeout(() => {
      const nextMove = chooseAiMove(localGame.boardState, "white");
      const nextMatchLike = applyMoveToMatch(
        {
          id: "local",
          hostUserId: "human",
          hostUserName: "human",
          guestUserId: "ai",
          guestUserName: "ai",
          status: "active",
          boardState: localGame.boardState,
          movesCount: localGame.movesCount,
          currentTurn: localGame.currentTurn,
          winner: localGame.winner,
          revision: 0,
          createdAt: instance.updatedAt,
          updatedAt: instance.updatedAt,
          acceptedAt: instance.updatedAt,
          finishedAt: null,
          expiresAt: null
        },
        { row: nextMove.row, col: nextMove.col, userId: "ai" }
      );
      onStateChange({
        ...instance.state,
        gomokuLocalGame: {
          boardState: nextMatchLike.boardState,
          status: nextMatchLike.status === "completed" ? "completed" : "playing",
          currentTurn: nextMatchLike.currentTurn,
          winner: nextMatchLike.winner,
          movesCount: nextMatchLike.movesCount,
          lastMove: { row: nextMove.row, col: nextMove.col, stone: "white" as const }
        }
      });
      aiTimerRef.current = null;
    }, 320);

    return () => {
      if (aiTimerRef.current !== null) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [instance.state, instance.updatedAt, localGame, mode, onStateChange]);

  const incomingInvites = useMemo(
    () => matches.filter((match) => match.status === "pending" && match.guestUserId === userId),
    [matches, userId]
  );
  const outgoingInvites = useMemo(
    () => matches.filter((match) => match.status === "pending" && match.hostUserId === userId),
    [matches, userId]
  );
  const activeMatches = useMemo(() => matches.filter((match) => match.status === "active"), [matches]);
  const recentFinishedMatch = useMemo(() => matches.find((match) => match.status === "completed") ?? null, [matches]);
  const currentOnlineMatch = activeMatches[0] ?? recentFinishedMatch;
  const onlineBoard = currentOnlineMatch?.boardState ?? createEmptyBoard();
  const onlineStatusText = statusTextForOnlineMatch(currentOnlineMatch, userId);

  const persistMode = (nextMode: GomokuMode) => {
    onStateChange({
      ...instance.state,
      gomokuMode: nextMode,
      gomokuLocalGame: instance.state.gomokuLocalGame ?? createInitialLocalGame()
    });
  };

  const resetLocalGame = () => {
    onStateChange({
      ...instance.state,
      gomokuMode: "ai",
      gomokuLocalGame: createInitialLocalGame()
    });
  };

  const playLocalMove = (row: number, col: number) => {
    if (mode !== "ai" || localGame.status !== "playing" || localGame.currentTurn !== "black") {
      return;
    }
    try {
      const nextMatchLike = applyMoveToMatch(
        {
          id: "local",
          hostUserId: "human",
          hostUserName: "human",
          guestUserId: "ai",
          guestUserName: "ai",
          status: "active",
          boardState: localGame.boardState,
          movesCount: localGame.movesCount,
          currentTurn: "black",
          winner: localGame.winner,
          revision: 0,
          createdAt: instance.updatedAt,
          updatedAt: instance.updatedAt,
          acceptedAt: instance.updatedAt,
          finishedAt: null,
          expiresAt: null
        },
        { row, col, userId: "human" }
      );
      onStateChange({
        ...instance.state,
        gomokuLocalGame: {
          boardState: nextMatchLike.boardState,
          status: nextMatchLike.status === "completed" ? "completed" : "playing",
          currentTurn: nextMatchLike.currentTurn,
          winner: nextMatchLike.winner,
          movesCount: nextMatchLike.movesCount,
          lastMove: { row, col, stone: "black" as const }
        }
      });
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "落子失败");
    }
  };

  const runOnlineAction = async (actionId: string, task: () => Promise<GomokuMatch>) => {
    setBusyId(actionId);
    setOnlineError("");
    try {
      const next = await task();
      setMatches((prev) => upsertMatchList(prev, next));
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "在线操作失败");
    } finally {
      setBusyId("");
    }
  };

  const inviteUser = (targetUserId: string, targetUserName: string) => {
    void runOnlineAction(`invite:${targetUserId}`, () =>
      createOnlineMatch({
        hostUserId: userId,
        hostUserName: userName,
        guestUserId: targetUserId,
        guestUserName: targetUserName
      })
    );
  };

  const playOnlineMove = (row: number, col: number) => {
    if (!currentOnlineMatch || currentOnlineMatch.status !== "active") return;
    const playerStone = stoneForUser(currentOnlineMatch, userId);
    if (!playerStone || playerStone !== currentOnlineMatch.currentTurn) return;
    void runOnlineAction(`move:${currentOnlineMatch.id}`, () => submitOnlineMove(currentOnlineMatch, row, col, userId));
  };

  const board = mode === "online" ? onlineBoard : localGame.boardState;
  const statusText = mode === "online" ? onlineStatusText : localStatusText(localGame);

  const occupiedPeers = useMemo(() => {
    const activePeerIds = new Set(
      matches
        .filter((match) => match.status === "pending" || match.status === "active")
        .map((match) => (match.hostUserId === userId ? match.guestUserId : match.hostUserId))
    );
    return activePeerIds;
  }, [matches, userId]);

  return (
    <Card
      title={definition.name}
      tone="peach"
      style={{
        height: isMobileMode ? "auto" : "100%",
        aspectRatio: isMobileMode ? "1 / 1" : undefined,
        padding: 10
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={modeButtonStyle(mode === "ai")} onClick={() => persistMode("ai")}>
              人机
            </button>
            <button type="button" style={modeButtonStyle(mode === "online")} onClick={() => persistMode("online")}>
              在线
            </button>
          </div>
          <button type="button" style={actionButtonStyle(false)} onClick={resetLocalGame}>
            重开
          </button>
        </div>

        <div
          style={{
            fontSize: 11,
            color: onlineError ? "#b91c1c" : "#475569",
            minHeight: 16,
            display: "flex",
            alignItems: "center"
          }}
        >
          {onlineError || statusText}
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateRows: mode === "online" ? "auto auto 1fr auto" : "1fr auto",
            gap: 8
          }}
        >
          {mode === "online" ? (
            <>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                {otherUsers.length > 0 ? (
                  otherUsers.map((entry) => {
                    const disabled = occupiedPeers.has(entry.userId) || Boolean(busyId);
                    return (
                      <button
                        key={entry.userId}
                        type="button"
                        disabled={disabled}
                        onClick={() => inviteUser(entry.userId, entry.userName)}
                        style={actionButtonStyle(disabled)}
                      >
                        邀请 {entry.userName}
                      </button>
                    );
                  })
                ) : (
                  <div style={{ fontSize: 11, color: "#64748b" }}>暂无其他在线用户</div>
                )}
              </div>

              <div style={{ display: "grid", gap: 4 }}>
                {incomingInvites.slice(0, 2).map((match) => (
                  <div
                    key={match.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 6,
                      alignItems: "center",
                      fontSize: 11,
                      color: "#0f172a",
                      padding: "6px 8px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.38)"
                    }}
                  >
                    <span>{match.hostUserName} 邀请你对战</span>
                    <button
                      type="button"
                      style={actionButtonStyle(busyId === `accept:${match.id}`)}
                      disabled={Boolean(busyId)}
                      onClick={() => void runOnlineAction(`accept:${match.id}`, () => acceptOnlineMatch(match, userId))}
                    >
                      接受
                    </button>
                    <button
                      type="button"
                      style={actionButtonStyle(busyId === `decline:${match.id}`)}
                      disabled={Boolean(busyId)}
                      onClick={() => void runOnlineAction(`decline:${match.id}`, () => declineOnlineMatch(match, userId))}
                    >
                      拒绝
                    </button>
                  </div>
                ))}
                {outgoingInvites.slice(0, 2).map((match) => (
                  <div
                    key={match.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 6,
                      alignItems: "center",
                      fontSize: 11,
                      color: "#475569",
                      padding: "6px 8px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.26)"
                    }}
                  >
                    <span>等待 {match.guestUserName} 确认</span>
                    <button
                      type="button"
                      style={actionButtonStyle(busyId === `cancel:${match.id}`)}
                      disabled={Boolean(busyId)}
                      onClick={() => void runOnlineAction(`cancel:${match.id}`, () => cancelOnlineMatch(match, userId))}
                    >
                      取消
                    </button>
                  </div>
                ))}
                {loadingMatches && incomingInvites.length === 0 && outgoingInvites.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#64748b" }}>正在同步在线对局...</div>
                ) : null}
              </div>
            </>
          ) : null}

          <div
            style={{
              position: "relative",
              minHeight: 0,
              borderRadius: 18,
              padding: 10,
              background: "linear-gradient(165deg, rgba(240, 207, 150, 0.78), rgba(214, 163, 101, 0.82))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -8px 24px rgba(120,53,15,0.08)"
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
                gap: 0,
                width: "100%",
                height: "100%",
                minHeight: 0,
                aspectRatio: "1 / 1"
              }}
            >
              {board.map((row, rowIndex) =>
                row.map((cell, colIndex) => {
                  const stone = cell === 1 ? "black" : cell === 2 ? "white" : null;
                  return (
                    <button
                      key={`${rowIndex}-${colIndex}`}
                      type="button"
                      data-no-drag="true"
                      onClick={() => (mode === "online" ? playOnlineMove(rowIndex, colIndex) : playLocalMove(rowIndex, colIndex))}
                      style={{
                        position: "relative",
                        border: "1px solid rgba(120,53,15,0.22)",
                        background: "rgba(255,255,255,0.05)",
                        padding: 0,
                        cursor:
                          stone ||
                          (mode === "online" &&
                            (!currentOnlineMatch ||
                              currentOnlineMatch.status !== "active" ||
                              stoneForUser(currentOnlineMatch, userId) !== currentOnlineMatch.currentTurn))
                            ? "default"
                            : "pointer"
                      }}
                    >
                      {stone ? (
                        <span
                          style={{
                            width: "68%",
                            height: "68%",
                            borderRadius: "50%",
                            display: "block",
                            margin: "0 auto",
                            background:
                              stone === "black"
                                ? "radial-gradient(circle at 30% 30%, #475569, #020617 75%)"
                                : "radial-gradient(circle at 30% 30%, #ffffff, #cbd5e1 78%)",
                            boxShadow:
                              stone === "black"
                                ? "0 2px 4px rgba(15,23,42,0.35)"
                                : "0 2px 4px rgba(148,163,184,0.45)"
                          }}
                        />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "#334155"
            }}
          >
            <span>{mode === "online" ? `在线模式 · ${statusText}` : `人机模式 · ${statusText}`}</span>
            {mode === "online" && currentOnlineMatch ? (
              <span>{stoneForUser(currentOnlineMatch, userId) === "black" ? "你执黑" : "你执白"}</span>
            ) : (
              <span>你执黑</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
