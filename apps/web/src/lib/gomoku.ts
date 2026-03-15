import { createId, nowIso } from "@xiaozhuoban/domain";

export const BOARD_SIZE = 15;
export const GOMOKU_INVITE_TTL_MS = 5 * 60 * 1000;
export const GOMOKU_ACTIVE_STATUSES = ["pending", "active"] as const;

export type GomokuStone = "black" | "white";
export type GomokuWinner = GomokuStone | "draw";
export type GomokuMatchStatus = "pending" | "active" | "declined" | "cancelled" | "completed" | "expired";
export type GomokuBoardCell = 0 | 1 | 2;
export type GomokuBoardState = GomokuBoardCell[][];

export interface GomokuMatch {
  id: string;
  hostUserId: string;
  hostUserName: string;
  guestUserId: string;
  guestUserName: string;
  status: GomokuMatchStatus;
  boardState: GomokuBoardState;
  movesCount: number;
  currentTurn: GomokuStone;
  winner: GomokuWinner | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
}

function isFiniteTimestamp(value: string | null | undefined) {
  if (!value) return false;
  return Number.isFinite(Date.parse(value));
}

function toBoardCell(value: number): GomokuBoardCell {
  return value === 1 || value === 2 ? value : 0;
}

function toStoneValue(stone: GomokuStone): GomokuBoardCell {
  return stone === "black" ? 1 : 2;
}

function fromStoneValue(value: GomokuBoardCell): GomokuStone | null {
  if (value === 1) return "black";
  if (value === 2) return "white";
  return null;
}

export function createEmptyBoard(): GomokuBoardState {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => 0 as GomokuBoardCell));
}

export function cloneBoard(board: GomokuBoardState): GomokuBoardState {
  return board.map((row) => row.slice()) as GomokuBoardState;
}

export function normalizeBoardState(value: unknown): GomokuBoardState {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE) {
    return createEmptyBoard();
  }
  return value.map((row) => {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) {
      return Array.from({ length: BOARD_SIZE }, () => 0 as GomokuBoardCell);
    }
    return row.map((cell) => toBoardCell(Number(cell))) as GomokuBoardCell[];
  }) as GomokuBoardState;
}

export function createInitialLocalGame() {
  return {
    boardState: createEmptyBoard(),
    status: "playing" as const,
    currentTurn: "black" as GomokuStone,
    winner: null as GomokuWinner | null,
    movesCount: 0,
    lastMove: null as { row: number; col: number; stone: GomokuStone } | null
  };
}

export function isInsideBoard(row: number, col: number) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function isBoardFull(board: GomokuBoardState) {
  return board.every((row) => row.every((cell) => cell !== 0));
}

export function getOpponentStone(stone: GomokuStone): GomokuStone {
  return stone === "black" ? "white" : "black";
}

function countDirection(board: GomokuBoardState, row: number, col: number, dx: number, dy: number, cell: GomokuBoardCell) {
  let count = 0;
  let nextRow = row + dx;
  let nextCol = col + dy;
  while (isInsideBoard(nextRow, nextCol) && board[nextRow][nextCol] === cell) {
    count += 1;
    nextRow += dx;
    nextCol += dy;
  }
  return count;
}

export function checkWinnerFromMove(board: GomokuBoardState, row: number, col: number): GomokuStone | null {
  if (!isInsideBoard(row, col)) return null;
  const cell = board[row][col];
  if (!cell) return null;
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ] as const;
  for (const [dx, dy] of directions) {
    const total = 1 + countDirection(board, row, col, dx, dy, cell) + countDirection(board, row, col, -dx, -dy, cell);
    if (total >= 5) {
      return fromStoneValue(cell);
    }
  }
  return null;
}

export function isValidMove(board: GomokuBoardState, row: number, col: number) {
  return isInsideBoard(row, col) && board[row][col] === 0;
}

export function placeStone(board: GomokuBoardState, row: number, col: number, stone: GomokuStone) {
  if (!isValidMove(board, row, col)) {
    throw new Error("当前位置不可落子");
  }
  const nextBoard = cloneBoard(board);
  nextBoard[row][col] = toStoneValue(stone);
  return nextBoard;
}

export function getMoveResult(board: GomokuBoardState, row: number, col: number) {
  const winner = checkWinnerFromMove(board, row, col);
  if (winner) {
    return { winner, status: "completed" as const };
  }
  if (isBoardFull(board)) {
    return { winner: "draw" as const, status: "completed" as const };
  }
  return { winner: null, status: "playing" as const };
}

function countLinePotential(
  board: GomokuBoardState,
  row: number,
  col: number,
  dx: number,
  dy: number,
  stone: GomokuStone
) {
  const cell = toStoneValue(stone);
  let forward = 0;
  let backward = 0;
  let openEnds = 0;

  let r = row + dx;
  let c = col + dy;
  while (isInsideBoard(r, c) && board[r][c] === cell) {
    forward += 1;
    r += dx;
    c += dy;
  }
  if (isInsideBoard(r, c) && board[r][c] === 0) {
    openEnds += 1;
  }

  r = row - dx;
  c = col - dy;
  while (isInsideBoard(r, c) && board[r][c] === cell) {
    backward += 1;
    r -= dx;
    c -= dy;
  }
  if (isInsideBoard(r, c) && board[r][c] === 0) {
    openEnds += 1;
  }

  return { total: 1 + forward + backward, openEnds };
}

function scorePattern(total: number, openEnds: number) {
  if (total >= 5) return 1_000_000;
  if (total === 4 && openEnds === 2) return 200_000;
  if (total === 4 && openEnds === 1) return 60_000;
  if (total === 3 && openEnds === 2) return 16_000;
  if (total === 3 && openEnds === 1) return 3_500;
  if (total === 2 && openEnds === 2) return 900;
  if (total === 2 && openEnds === 1) return 180;
  if (total === 1 && openEnds === 2) return 40;
  return 8;
}

export function scoreMove(board: GomokuBoardState, row: number, col: number, stone: GomokuStone) {
  if (!isValidMove(board, row, col)) {
    return Number.NEGATIVE_INFINITY;
  }
  const simulated = placeStone(board, row, col, stone);
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ] as const;
  const patternScore = directions.reduce((sum, [dx, dy]) => {
    const { total, openEnds } = countLinePotential(simulated, row, col, dx, dy, stone);
    return sum + scorePattern(total, openEnds);
  }, 0);
  const center = (BOARD_SIZE - 1) / 2;
  const centerBias = 24 - (Math.abs(row - center) + Math.abs(col - center));
  return patternScore + centerBias;
}

export function getCandidateMoves(board: GomokuBoardState) {
  const candidates = new Set<string>();
  let hasStone = false;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col] === 0) continue;
      hasStone = true;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          const nextRow = row + dx;
          const nextCol = col + dy;
          if (isValidMove(board, nextRow, nextCol)) {
            candidates.add(`${nextRow}:${nextCol}`);
          }
        }
      }
    }
  }
  if (!hasStone) {
    const center = Math.floor(BOARD_SIZE / 2);
    return [{ row: center, col: center }];
  }
  return [...candidates].map((item) => {
    const [row, col] = item.split(":").map(Number);
    return { row, col };
  });
}

export function chooseAiMove(board: GomokuBoardState, stone: GomokuStone) {
  const candidates = getCandidateMoves(board);
  const opponent = getOpponentStone(stone);
  let bestMove = candidates[0] ?? { row: Math.floor(BOARD_SIZE / 2), col: Math.floor(BOARD_SIZE / 2) };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const move of candidates) {
    const ownWinBoard = placeStone(board, move.row, move.col, stone);
    if (checkWinnerFromMove(ownWinBoard, move.row, move.col) === stone) {
      return move;
    }
  }

  for (const move of candidates) {
    const blockBoard = placeStone(board, move.row, move.col, opponent);
    if (checkWinnerFromMove(blockBoard, move.row, move.col) === opponent) {
      return move;
    }
  }

  for (const move of candidates) {
    const attackScore = scoreMove(board, move.row, move.col, stone);
    const defenseScore = scoreMove(board, move.row, move.col, opponent);
    const compositeScore = attackScore * 1.2 + defenseScore * 0.95;
    if (compositeScore > bestScore) {
      bestScore = compositeScore;
      bestMove = move;
    }
  }

  return bestMove;
}

export function createPendingMatch(params: {
  hostUserId: string;
  hostUserName: string;
  guestUserId: string;
  guestUserName: string;
  createdAt?: string;
  expiresAt?: string;
}) {
  const createdAt = params.createdAt ?? nowIso();
  const expiresAt = params.expiresAt ?? new Date(Date.parse(createdAt) + GOMOKU_INVITE_TTL_MS).toISOString();
  return {
    id: createId("gomoku"),
    hostUserId: params.hostUserId,
    hostUserName: params.hostUserName,
    guestUserId: params.guestUserId,
    guestUserName: params.guestUserName,
    status: "pending" as const,
    boardState: createEmptyBoard(),
    movesCount: 0,
    currentTurn: "black" as GomokuStone,
    winner: null,
    revision: 0,
    createdAt,
    updatedAt: createdAt,
    acceptedAt: null,
    finishedAt: null,
    expiresAt
  } satisfies GomokuMatch;
}

export function isPendingMatchExpired(match: GomokuMatch, currentTime = nowIso()) {
  return match.status === "pending" && isFiniteTimestamp(match.expiresAt) && Date.parse(currentTime) >= Date.parse(match.expiresAt as string);
}

export function expireMatch(match: GomokuMatch, expiredAt = nowIso()) {
  if (match.status !== "pending") {
    return match;
  }
  return {
    ...match,
    status: "expired" as const,
    revision: match.revision + 1,
    updatedAt: expiredAt
  };
}

export function acceptMatch(match: GomokuMatch, guestUserId: string, acceptedAt = nowIso()) {
  if (match.status !== "pending") {
    throw new Error("邀请已失效");
  }
  if (match.guestUserId !== guestUserId) {
    throw new Error("只有被邀请方可以接受对局");
  }
  if (isPendingMatchExpired(match, acceptedAt)) {
    throw new Error("邀请已过期");
  }
  return {
    ...match,
    status: "active" as const,
    acceptedAt,
    updatedAt: acceptedAt,
    revision: match.revision + 1
  };
}

export function declineMatch(match: GomokuMatch, guestUserId: string, declinedAt = nowIso()) {
  if (match.status !== "pending") {
    throw new Error("邀请已失效");
  }
  if (match.guestUserId !== guestUserId) {
    throw new Error("只有被邀请方可以拒绝对局");
  }
  return {
    ...match,
    status: "declined" as const,
    updatedAt: declinedAt,
    revision: match.revision + 1
  };
}

export function cancelMatch(match: GomokuMatch, hostUserId: string, cancelledAt = nowIso()) {
  if (match.status !== "pending") {
    throw new Error("当前邀请无法取消");
  }
  if (match.hostUserId !== hostUserId) {
    throw new Error("只有发起方可以取消邀请");
  }
  return {
    ...match,
    status: "cancelled" as const,
    updatedAt: cancelledAt,
    revision: match.revision + 1
  };
}

export function stoneForUser(match: GomokuMatch, userId: string): GomokuStone | null {
  if (match.hostUserId === userId) return "black";
  if (match.guestUserId === userId) return "white";
  return null;
}

export function applyMoveToMatch(
  match: GomokuMatch,
  params: { row: number; col: number; userId: string; movedAt?: string }
) {
  if (match.status !== "active") {
    throw new Error("当前对局未开始");
  }
  const playerStone = stoneForUser(match, params.userId);
  if (!playerStone) {
    throw new Error("当前用户不在该对局中");
  }
  if (match.currentTurn !== playerStone) {
    throw new Error("还没轮到你");
  }
  const movedAt = params.movedAt ?? nowIso();
  const nextBoard = placeStone(match.boardState, params.row, params.col, playerStone);
  const moveResult = getMoveResult(nextBoard, params.row, params.col);
  return {
    ...match,
    boardState: nextBoard,
    movesCount: match.movesCount + 1,
    currentTurn: moveResult.status === "completed" ? match.currentTurn : getOpponentStone(playerStone),
    winner: moveResult.winner,
    status: moveResult.status === "completed" ? ("completed" as const) : match.status,
    updatedAt: movedAt,
    finishedAt: moveResult.status === "completed" ? movedAt : null,
    revision: match.revision + 1
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

export function upsertMatchList(matches: GomokuMatch[], incoming: GomokuMatch) {
  const next = new Map(matches.map((match) => [match.id, match]));
  next.set(incoming.id, incoming);
  return sortMatches(
    [...next.values()].filter(
      (match) => match.status === "pending" || match.status === "active" || match.status === "completed"
    )
  );
}
