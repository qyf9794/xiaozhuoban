import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { Card } from "@xiaozhuoban/ui";
import { useAuthStore } from "../auth/authStore";
import { colorForUser, resolveUserName } from "../lib/collab";
import {
  applyMoveToMatch,
  BOARD_SIZE,
  chooseAiMove,
  createEmptyBoard,
  createInitialLocalGame,
  normalizeBoardState,
  playerSlotForUser,
  scoreForSlot,
  startNextRound,
  stoneForUser,
  type GomokuBoardState,
  type GomokuMatch,
  type GomokuRoundState,
  type GomokuSeriesWinner,
  type GomokuWinner,
  upsertMatchList
} from "../lib/gomoku";
import {
  acceptOnlineMatch,
  advanceOnlineRound,
  cancelOnlineMatch,
  confirmOnlineRematch,
  createOnlineMatch,
  declineOnlineMatch,
  exitOnlineSeries,
  listRelevantMatches,
  removeMatchChannel,
  submitOnlineMove,
  subscribeToUserMatches,
  toGomokuOnlineError
} from "../lib/gomokuOnline";
import { useOnlineUsers } from "../lib/useOnlineUsers";

type GomokuMode = "ai" | "online";
const LOCAL_HUMAN_ID = "human";
const LOCAL_AI_ID = "ai";

function normalizeMode(value: unknown): GomokuMode {
  return value === "online" ? "online" : "ai";
}

function normalizeWinner(value: unknown): GomokuWinner | null {
  if (value === "black" || value === "white" || value === "draw") {
    return value;
  }
  return null;
}

function normalizeSeriesWinner(value: unknown): GomokuSeriesWinner {
  return value === "host" || value === "guest" ? value : null;
}

function normalizeRoundState(value: unknown): GomokuRoundState {
  if (value === "round_complete" || value === "series_complete") {
    return value;
  }
  return "playing";
}

function normalizeLocalGame(value: unknown): GomokuMatch | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!raw.boardState) {
    return null;
  }
  const fallback = createInitialLocalGame();
  return {
    ...fallback,
    id: typeof raw.id === "string" ? raw.id : fallback.id,
    hostUserId: typeof raw.hostUserId === "string" ? raw.hostUserId : fallback.hostUserId,
    hostUserName: typeof raw.hostUserName === "string" ? raw.hostUserName : fallback.hostUserName,
    guestUserId: typeof raw.guestUserId === "string" ? raw.guestUserId : fallback.guestUserId,
    guestUserName: typeof raw.guestUserName === "string" ? raw.guestUserName : fallback.guestUserName,
    status: raw.status === "completed" ? "completed" : "active",
    roundState: normalizeRoundState(raw.roundState),
    boardState: normalizeBoardState(raw.boardState),
    movesCount: typeof raw.movesCount === "number" ? raw.movesCount : 0,
    currentTurn: raw.currentTurn === "white" ? "white" : "black",
    winner: normalizeWinner(raw.winner),
    seriesWinner: normalizeSeriesWinner(raw.seriesWinner),
    currentRound: typeof raw.currentRound === "number" ? raw.currentRound : 1,
    hostWins: typeof raw.hostWins === "number" ? raw.hostWins : 0,
    guestWins: typeof raw.guestWins === "number" ? raw.guestWins : 0,
    drawCount: typeof raw.drawCount === "number" ? raw.drawCount : 0,
    blackUserId: typeof raw.blackUserId === "string" ? raw.blackUserId : fallback.blackUserId,
    whiteUserId: typeof raw.whiteUserId === "string" ? raw.whiteUserId : fallback.whiteUserId,
    rematchHostConfirmed: raw.rematchHostConfirmed === true,
    rematchGuestConfirmed: raw.rematchGuestConfirmed === true,
    revision: typeof raw.revision === "number" ? raw.revision : 0,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallback.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt,
    acceptedAt: typeof raw.acceptedAt === "string" ? raw.acceptedAt : fallback.acceptedAt,
    finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : null,
    roundFinishedAt: typeof raw.roundFinishedAt === "string" ? raw.roundFinishedAt : null,
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : null
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

function actionButtonStyle(disabled = false, emphasis = false): CSSProperties {
  return {
    border: emphasis ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(148,163,184,0.36)",
    borderRadius: 10,
    padding: "5px 8px",
    fontSize: 11,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    background: emphasis
      ? "linear-gradient(155deg, rgba(37,99,235,0.82), rgba(14,165,233,0.72))"
      : "linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34))",
    color: emphasis ? "#eff6ff" : "#0f172a"
  };
}

function stoneLabel(stone: GomokuMatch["currentTurn"] | null) {
  if (stone === "black") return "黑棋";
  if (stone === "white") return "白棋";
  return "";
}

function roundWinnerText(winner: GomokuWinner | null) {
  if (winner === "black") return "黑棋获胜";
  if (winner === "white") return "白棋获胜";
  if (winner === "draw") return "本局平局";
  return "";
}

function seriesWinnerText(match: GomokuMatch, userId: string, localMode = false) {
  if (match.seriesWinner === "host") {
    if (localMode) return "你赢得比赛";
    return match.hostUserId === userId ? "你赢得比赛" : `${match.hostUserName} 赢得比赛`;
  }
  if (match.seriesWinner === "guest") {
    if (localMode) return "AI 赢得比赛";
    return match.guestUserId === userId ? "你赢得比赛" : `${match.guestUserName} 赢得比赛`;
  }
  return "";
}

function getScoreText(match: GomokuMatch, userId: string, localMode = false) {
  const slot = playerSlotForUser(match, userId);
  if (!slot) {
    return `${match.hostWins} : ${match.guestWins}`;
  }
  const selfScore = scoreForSlot(match, slot);
  const opponentScore = scoreForSlot(match, slot === "host" ? "guest" : "host");
  return localMode ? `你 ${selfScore} : ${opponentScore} AI` : `你 ${selfScore} : ${opponentScore} 对手`;
}

function getScoreDisplay(match: GomokuMatch, userId: string, localMode = false) {
  const slot = playerSlotForUser(match, userId);
  if (!slot) {
    return {
      leftUserKey: localMode ? LOCAL_HUMAN_ID : match.hostUserId,
      leftName: localMode ? "你" : match.hostUserName,
      leftScore: match.hostWins,
      rightScore: match.guestWins,
      rightUserKey: localMode ? LOCAL_AI_ID : match.guestUserId,
      rightName: localMode ? "AI" : match.guestUserName
    };
  }

  const opponentSlot = slot === "host" ? "guest" : "host";
  return {
    leftUserKey: localMode ? LOCAL_HUMAN_ID : slot === "host" ? match.hostUserId : match.guestUserId,
    leftName: slot === "host" ? (localMode ? "你" : "你") : localMode ? "你" : "你",
    leftScore: scoreForSlot(match, slot),
    rightScore: scoreForSlot(match, opponentSlot),
    rightUserKey: localMode ? LOCAL_AI_ID : slot === "host" ? match.guestUserId : match.hostUserId,
    rightName: localMode ? "AI" : slot === "host" ? match.guestUserName : match.hostUserName
  };
}

function getStatusText(match: GomokuMatch | null, userId: string, localMode = false) {
  if (!match) {
    return localMode ? "点击开始人机对战" : "选择在线用户发起邀请";
  }
  if (match.status === "pending") {
    return match.guestUserId === userId ? "收到邀请，确认后开始对局" : "邀请已发出，等待对方确认";
  }
  if (match.roundState === "playing") {
    const selfStone = stoneForUser(match, userId);
    if (!selfStone) return localMode ? "准备开始" : "当前用户不在该对局中";
    return match.currentTurn === selfStone ? `轮到你落子（${stoneLabel(selfStone)}）` : "等待对手落子";
  }
  if (match.roundState === "round_complete") {
    return `${roundWinnerText(match.winner)} · 比分 ${getScoreText(match, userId, localMode)}`;
  }
  return `${seriesWinnerText(match, userId, localMode)} · 总比分 ${getScoreText(match, userId, localMode)}`;
}

function getOverlayTitle(match: GomokuMatch | null, userId: string, localMode = false) {
  if (!match) return "";
  if (match.roundState === "round_complete") {
    return roundWinnerText(match.winner);
  }
  if (match.roundState === "series_complete") {
    return seriesWinnerText(match, userId, localMode);
  }
  return "";
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
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const aiTimerRef = useRef<number | null>(null);
  const roundAdvanceTimerRef = useRef<number | null>(null);
  const onlineRoundAdvanceTimerRef = useRef<number | null>(null);
  const invitePickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mode !== "online") {
      setLoadingMatches(false);
      return;
    }
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
          setOnlineError(toGomokuOnlineError(error).message);
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
  }, [mode, userId]);

  useEffect(() => {
    if (mode !== "ai" || !localGame) return;
    const aiStone = stoneForUser(localGame, LOCAL_AI_ID);
    if (localGame.status !== "active" || localGame.roundState !== "playing" || localGame.currentTurn !== aiStone) return;
    if (aiTimerRef.current !== null) {
      window.clearTimeout(aiTimerRef.current);
    }
    aiTimerRef.current = window.setTimeout(() => {
      const nextMove = chooseAiMove(localGame.boardState, aiStone ?? "black");
      const nextState = applyMoveToMatch(localGame, { row: nextMove.row, col: nextMove.col, userId: LOCAL_AI_ID });
      onStateChange({ ...instance.state, gomokuLocalGame: nextState });
      aiTimerRef.current = null;
    }, 320);
    return () => {
      if (aiTimerRef.current !== null) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [instance.state, localGame, mode, onStateChange]);

  useEffect(() => {
    if (mode !== "ai" || !localGame) return;
    if (localGame.status !== "active" || localGame.roundState !== "round_complete") return;
    if (roundAdvanceTimerRef.current !== null) {
      window.clearTimeout(roundAdvanceTimerRef.current);
    }
    roundAdvanceTimerRef.current = window.setTimeout(() => {
      const nextState = startNextRound(localGame, LOCAL_HUMAN_ID);
      onStateChange({ ...instance.state, gomokuLocalGame: nextState });
      roundAdvanceTimerRef.current = null;
    }, 1400);
    return () => {
      if (roundAdvanceTimerRef.current !== null) {
        window.clearTimeout(roundAdvanceTimerRef.current);
        roundAdvanceTimerRef.current = null;
      }
    };
  }, [instance.state, localGame, mode, onStateChange]);

  const incomingInvites = useMemo(
    () => matches.filter((match) => match.status === "pending" && match.guestUserId === userId),
    [matches, userId]
  );
  const outgoingInvites = useMemo(
    () => matches.filter((match) => match.status === "pending" && match.hostUserId === userId),
    [matches, userId]
  );
  const currentOnlineMatch = useMemo(
    () => matches.find((match) => match.status === "active") ?? matches.find((match) => match.status === "completed") ?? null,
    [matches]
  );

  useEffect(() => {
    if (mode !== "online" || !currentOnlineMatch) return;
    if (currentOnlineMatch.status !== "active" || currentOnlineMatch.roundState !== "round_complete") return;
    if (onlineRoundAdvanceTimerRef.current !== null) {
      window.clearTimeout(onlineRoundAdvanceTimerRef.current);
    }
    onlineRoundAdvanceTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await advanceOnlineRound(currentOnlineMatch, userId);
          setMatches((prev) => upsertMatchList(prev, next));
        } catch {
          // Another client may have already advanced the round.
        } finally {
          onlineRoundAdvanceTimerRef.current = null;
        }
      })();
    }, 1400);
    return () => {
      if (onlineRoundAdvanceTimerRef.current !== null) {
        window.clearTimeout(onlineRoundAdvanceTimerRef.current);
        onlineRoundAdvanceTimerRef.current = null;
      }
    };
  }, [currentOnlineMatch, mode, userId]);

  useEffect(() => {
    if (mode !== "online" || currentOnlineMatch) {
      setInvitePickerOpen(false);
    }
  }, [currentOnlineMatch, mode]);

  useEffect(() => {
    if (!invitePickerOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!invitePickerRef.current) return;
      if (!invitePickerRef.current.contains(event.target as Node)) {
        setInvitePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [invitePickerOpen]);

  const startLocalSeries = () => {
    onStateChange({
      ...instance.state,
      gomokuMode: "ai",
      gomokuLocalGame: createInitialLocalGame()
    });
  };

  const clearLocalSeries = () => {
    onStateChange({
      ...instance.state,
      gomokuMode: "ai",
      gomokuLocalGame: null
    });
  };

  const persistMode = (nextMode: GomokuMode) => {
    if (nextMode !== "online") {
      setInvitePickerOpen(false);
    }
    onStateChange({
      ...instance.state,
      gomokuMode: nextMode,
      gomokuLocalGame: nextMode === "ai" ? (instance.state.gomokuLocalGame ?? null) : instance.state.gomokuLocalGame
    });
  };

  const exitCurrentMatch = () => {
    setOnlineError("");
    if (mode === "online") {
      if (!currentOnlineMatch) return;
      void runOnlineAction(`exit:${currentOnlineMatch.id}`, () => exitOnlineSeries(currentOnlineMatch, userId));
      return;
    }
    clearLocalSeries();
  };

  const runOnlineAction = async (actionId: string, task: () => Promise<GomokuMatch>) => {
    setBusyId(actionId);
    setOnlineError("");
    try {
      const next = await task();
      setMatches((prev) => upsertMatchList(prev, next));
    } catch (error) {
      setOnlineError(toGomokuOnlineError(error, "在线操作失败").message);
    } finally {
      setBusyId("");
    }
  };

  const board: GomokuBoardState =
    mode === "online" ? currentOnlineMatch?.boardState ?? createEmptyBoard() : localGame?.boardState ?? createEmptyBoard();
  const displayMatch = mode === "online" ? currentOnlineMatch : localGame;
  const statusText = getStatusText(displayMatch, mode === "online" ? userId : LOCAL_HUMAN_ID, mode === "ai");
  const overlayTitle = getOverlayTitle(displayMatch, mode === "online" ? userId : LOCAL_HUMAN_ID, mode === "ai");
  const scoreText = displayMatch ? getScoreText(displayMatch, mode === "online" ? userId : LOCAL_HUMAN_ID, mode === "ai") : "";
  const scoreDisplay = displayMatch ? getScoreDisplay(displayMatch, mode === "online" ? userId : LOCAL_HUMAN_ID, mode === "ai") : null;
  const selfStone = displayMatch ? stoneForUser(displayMatch, mode === "online" ? userId : LOCAL_HUMAN_ID) : null;
  const selfSlot = displayMatch ? playerSlotForUser(displayMatch, mode === "online" ? userId : LOCAL_HUMAN_ID) : null;
  const statusLineText = mode === "online" ? onlineError || statusText : statusText;
  const onlineUnavailable = onlineError.includes("在线对战未初始化");
  const showStatusRow = Boolean(statusLineText || selfStone);
  const cardPadding = isMobileMode ? "8px 12px 6px" : 8;
  const sectionGap = isMobileMode ? 4 : 8;
  const boardPadding = isMobileMode ? 4 : 8;
  const boardScaleInset = isMobileMode ? "18px" : "0px";

  const occupiedPeers = useMemo(() => {
    const activePeerIds = new Set(
      matches
        .filter((match) => match.status === "pending" || match.status === "active" || match.status === "completed")
        .map((match) => (match.hostUserId === userId ? match.guestUserId : match.hostUserId))
    );
    return activePeerIds;
  }, [matches, userId]);
  const inviteableUsers = useMemo(
    () => otherUsers.filter((entry) => !occupiedPeers.has(entry.userId)),
    [occupiedPeers, otherUsers]
  );

  const playLocalMove = (row: number, col: number) => {
    if (mode !== "ai" || !localGame) return;
    const humanStone = stoneForUser(localGame, LOCAL_HUMAN_ID);
    if (localGame.status !== "active" || localGame.roundState !== "playing" || localGame.currentTurn !== humanStone) {
      return;
    }
    try {
      const nextState = applyMoveToMatch(localGame, { row, col, userId: LOCAL_HUMAN_ID });
      onStateChange({ ...instance.state, gomokuLocalGame: nextState });
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "落子失败");
    }
  };

  const playOnlineMove = (row: number, col: number) => {
    if (!currentOnlineMatch || currentOnlineMatch.status !== "active" || currentOnlineMatch.roundState !== "playing") return;
    const playerStone = stoneForUser(currentOnlineMatch, userId);
    if (!playerStone || playerStone !== currentOnlineMatch.currentTurn) return;
    void runOnlineAction(`move:${currentOnlineMatch.id}`, () => submitOnlineMove(currentOnlineMatch, row, col, userId));
  };

  const canPlayCell =
    displayMatch?.status === "active" &&
    displayMatch.roundState === "playing" &&
    displayMatch.currentTurn === selfStone;

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
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: sectionGap
          }}
        >
          <div style={{ display: "flex", gap: 6, justifySelf: "start" }}>
            <button type="button" style={modeButtonStyle(mode === "ai")} onClick={() => persistMode("ai")}>
              人机
            </button>
            <button type="button" style={modeButtonStyle(mode === "online")} onClick={() => persistMode("online")}>
              在线
            </button>
          </div>
          <div
            style={{
              minHeight: 18,
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: isMobileMode ? 6 : 8,
              whiteSpace: "nowrap",
              overflow: "hidden"
            }}
          >
            {scoreDisplay ? (
              <>
                <span
                  style={{
                    fontSize: isMobileMode ? 14 : 17,
                    fontWeight: 600,
                    color: colorForUser(scoreDisplay.leftUserKey),
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {scoreDisplay.leftName}
                </span>
                <span
                  style={{
                    fontSize: isMobileMode ? 20 : 24,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: "#334155"
                  }}
                >
                  {scoreDisplay.leftScore} : {scoreDisplay.rightScore}
                </span>
                <span
                  style={{
                    fontSize: isMobileMode ? 14 : 17,
                    fontWeight: 600,
                    color: colorForUser(scoreDisplay.rightUserKey),
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {scoreDisplay.rightName}
                </span>
              </>
            ) : null}
          </div>
          {mode === "ai" ? (
            localGame ? (
              <div style={{ display: "flex", justifyContent: "flex-end", justifySelf: "end", gap: 6 }}>
                <button type="button" style={actionButtonStyle(false)} onClick={startLocalSeries}>
                  重新比赛
                </button>
                <button type="button" style={actionButtonStyle(false)} onClick={exitCurrentMatch}>
                  退出
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "flex-end", justifySelf: "end" }}>
                <button type="button" style={actionButtonStyle(false, true)} onClick={startLocalSeries}>
                  开始对战
                </button>
              </div>
            )
          ) : mode === "online" ? (
            <div
              ref={invitePickerRef}
              style={{ display: "flex", justifyContent: "flex-end", justifySelf: "end", position: "relative", gap: 6 }}
            >
              {!onlineUnavailable && !currentOnlineMatch ? (
                <button
                  type="button"
                  style={actionButtonStyle(false, true)}
                  onClick={() => setInvitePickerOpen((open) => !open)}
                >
                  邀请
                </button>
              ) : null}
              {currentOnlineMatch ? (
                <button type="button" style={actionButtonStyle(false)} onClick={exitCurrentMatch}>
                  退出
                </button>
              ) : null}
              {invitePickerOpen ? (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    zIndex: 5,
                    width: isMobileMode ? 220 : 240,
                    display: "grid",
                    gap: 6,
                    padding: 8,
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,0.22)",
                    background: "rgba(255,255,255,0.88)",
                    boxShadow: "0 14px 28px rgba(15,23,42,0.12)",
                    backdropFilter: "blur(10px)"
                  }}
                >
                  {inviteableUsers.length > 0 ? (
                    inviteableUsers.map((entry) => (
                      <button
                        key={entry.userId}
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => {
                          setInvitePickerOpen(false);
                          void runOnlineAction(`invite:${entry.userId}`, () =>
                            createOnlineMatch({
                              hostUserId: userId,
                              hostUserName: userName,
                              guestUserId: entry.userId,
                              guestUserName: entry.userName
                            })
                          );
                        }}
                        style={{
                          ...actionButtonStyle(Boolean(busyId)),
                          width: "100%",
                          textAlign: "left",
                          padding: "7px 10px"
                        }}
                      >
                        邀请 {entry.userName}
                      </button>
                    ))
                  ) : (
                    <div style={{ fontSize: 11, color: "#64748b", padding: "2px 4px" }}>暂无可邀请的在线用户</div>
                  )}
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
                        background: "rgba(255,255,255,0.5)"
                      }}
                    >
                      <span>{match.hostUserName} 邀请你</span>
                      <button
                        type="button"
                        style={actionButtonStyle(Boolean(busyId), true)}
                        disabled={Boolean(busyId)}
                        onClick={() => {
                          setInvitePickerOpen(false);
                          void runOnlineAction(`accept:${match.id}`, () => acceptOnlineMatch(match, userId));
                        }}
                      >
                        接受
                      </button>
                      <button
                        type="button"
                        style={actionButtonStyle(Boolean(busyId))}
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
                        background: "rgba(255,255,255,0.38)"
                      }}
                    >
                      <span>等待 {match.guestUserName} 确认</span>
                      <button
                        type="button"
                        style={actionButtonStyle(Boolean(busyId))}
                        disabled={Boolean(busyId)}
                        onClick={() => void runOnlineAction(`cancel:${match.id}`, () => cancelOnlineMatch(match, userId))}
                      >
                        取消
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ justifySelf: "end" }} />
          )}
        </div>

        {showStatusRow ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: sectionGap,
              alignItems: "center",
              minHeight: 16,
              fontSize: isMobileMode ? 10 : 11
            }}
          >
            <span style={{ color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {statusLineText}
            </span>
            <span style={{ color: "#334155" }}>
              {selfStone ? `你执${stoneLabel(selfStone)}` : ""}
            </span>
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
              placeItems: "center",
              width: "100%",
              aspectRatio: isMobileMode ? "1 / 1" : undefined,
              borderRadius: 18,
              padding: boardPadding,
              background: "linear-gradient(165deg, rgba(240, 207, 150, 0.78), rgba(214, 163, 101, 0.82))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -8px 24px rgba(120,53,15,0.08)"
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
                width: isMobileMode ? `calc(100% - ${boardScaleInset})` : "100%",
                maxWidth: isMobileMode ? `calc(100% - ${boardScaleInset})` : "100%",
                aspectRatio: "1 / 1",
                margin: 0
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
                        cursor: stone || !canPlayCell ? "default" : "pointer"
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

            {displayMatch && displayMatch.roundState !== "playing" ? (
              <div
                style={{
                  position: "absolute",
                  inset: 10,
                  display: "grid",
                  placeItems: "center",
                  pointerEvents: "none"
                }}
              >
                <div
                  style={{
                    minWidth: 220,
                    maxWidth: "80%",
                    padding: "18px 20px",
                    borderRadius: 18,
                    background: "rgba(15,23,42,0.72)",
                    color: "#f8fafc",
                    textAlign: "center",
                    boxShadow: "0 18px 40px rgba(15,23,42,0.24)"
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{overlayTitle}</div>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>{`当前比分 ${scoreText}`}</div>
                  {displayMatch.roundState === "round_complete" ? (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>下一局即将开始，黑白将重新随机分配</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {displayMatch && displayMatch.roundState === "series_complete" ? (
            <div
              style={{
                display: "flex",
                justifyContent: mode === "online" ? "space-between" : "flex-end",
                gap: 8,
                alignItems: "center",
                fontSize: 11,
                color: "#334155"
              }}
            >
              {mode === "online" ? (
                <>
                  <span style={{ color: "#64748b" }}>
                    {selfSlot === "host" ? (displayMatch.rematchHostConfirmed ? "已确认重赛" : "") : ""}
                    {selfSlot === "guest" ? (displayMatch.rematchGuestConfirmed ? "已确认重赛" : "") : ""}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      style={actionButtonStyle(Boolean(busyId), true)}
                      disabled={Boolean(busyId) || (selfSlot === "host" ? displayMatch.rematchHostConfirmed : displayMatch.rematchGuestConfirmed)}
                      onClick={() => void runOnlineAction(`rematch:${displayMatch.id}`, () => confirmOnlineRematch(displayMatch, userId))}
                    >
                      重新比赛
                    </button>
                    <button
                      type="button"
                      style={actionButtonStyle(Boolean(busyId))}
                      disabled={Boolean(busyId)}
                      onClick={() => void runOnlineAction(`exit:${displayMatch.id}`, () => exitOnlineSeries(displayMatch, userId))}
                    >
                      退出
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" style={actionButtonStyle(false, true)} onClick={startLocalSeries}>
                    重新比赛
                  </button>
                  <button type="button" style={actionButtonStyle(false)} onClick={clearLocalSeries}>
                    退出
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
