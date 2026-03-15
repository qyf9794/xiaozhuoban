import { describe, expect, it } from "vitest";
import {
  acceptMatch,
  applyMoveToMatch,
  BOARD_SIZE,
  checkWinnerFromMove,
  chooseAiMove,
  createEmptyBoard,
  type GomokuMatch,
  createPendingMatch,
  expireMatch,
  getMoveResult,
  isBoardFull,
  placeStone
} from "./gomoku";

describe("gomoku rules", () => {
  function buildDrawBoard() {
    let board = createEmptyBoard();
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const preferred = (row + col) % 2 === 0 ? "black" : "white";
        const candidates = [preferred, preferred === "black" ? "white" : "black"] as const;
        const chosen =
          candidates.find((stone) => {
            try {
              const nextBoard = placeStone(board, row, col, stone);
              return checkWinnerFromMove(nextBoard, row, col) === null;
            } catch {
              return false;
            }
          }) ?? candidates[0];
        board = placeStone(board, row, col, chosen);
      }
    }
    return board;
  }

  it("detects horizontal, vertical, and diagonal wins", () => {
    const horizontal = createEmptyBoard();
    const vertical = createEmptyBoard();
    const diagonal = createEmptyBoard();

    for (let index = 0; index < 5; index += 1) {
      horizontal[7][index] = 1;
      vertical[index][7] = 2;
      diagonal[index][index] = 1;
    }

    expect(checkWinnerFromMove(horizontal, 7, 4)).toBe("black");
    expect(checkWinnerFromMove(vertical, 4, 7)).toBe("white");
    expect(checkWinnerFromMove(diagonal, 4, 4)).toBe("black");
  });

  it("rejects duplicate moves and resolves draw state", () => {
    const board = placeStone(createEmptyBoard(), 7, 7, "black");
    expect(() => placeStone(board, 7, 7, "white")).toThrow("当前位置不可落子");

    const drawBoard = buildDrawBoard();

    expect(isBoardFull(drawBoard)).toBe(true);
    expect(getMoveResult(drawBoard, BOARD_SIZE - 1, BOARD_SIZE - 1)).toEqual({
      winner: "draw",
      status: "completed"
    });
  });
});

describe("gomoku ai", () => {
  it("prioritizes winning immediately", () => {
    let board = createEmptyBoard();
    for (let index = 0; index < 4; index += 1) {
      board = placeStone(board, 7, index + 4, "white");
    }

    expect([{ row: 7, col: 3 }, { row: 7, col: 8 }]).toContainEqual(chooseAiMove(board, "white"));
  });

  it("blocks opponent's immediate five", () => {
    let board = createEmptyBoard();
    for (let index = 0; index < 4; index += 1) {
      board = placeStone(board, 5 + index, 5, "black");
    }

    expect([{ row: 4, col: 5 }, { row: 9, col: 5 }]).toContainEqual(chooseAiMove(board, "white"));
  });
});

describe("gomoku online helpers", () => {
  it("activates a pending match only for the guest", () => {
    const pending = createPendingMatch({
      hostUserId: "host",
      hostUserName: "Host",
      guestUserId: "guest",
      guestUserName: "Guest",
      createdAt: "2026-03-15T00:00:00.000Z",
      expiresAt: "2026-03-15T00:05:00.000Z"
    });

    const active = acceptMatch(pending, "guest", "2026-03-15T00:01:00.000Z");
    expect(active.status).toBe("active");
    expect(active.revision).toBe(1);
    expect(() => acceptMatch(pending, "other", "2026-03-15T00:01:00.000Z")).toThrow("只有被邀请方可以接受对局");
  });

  it("marks expired pending matches", () => {
    const pending = createPendingMatch({
      hostUserId: "host",
      hostUserName: "Host",
      guestUserId: "guest",
      guestUserName: "Guest",
      createdAt: "2026-03-15T00:00:00.000Z",
      expiresAt: "2026-03-15T00:05:00.000Z"
    });
    const expired = expireMatch(pending, "2026-03-15T00:06:00.000Z");
    expect(expired.status).toBe("expired");
    expect(expired.revision).toBe(1);
  });

  it("applies moves with turn validation and finishes on five", () => {
    let match: GomokuMatch = acceptMatch(
      createPendingMatch({
        hostUserId: "host",
        hostUserName: "Host",
        guestUserId: "guest",
        guestUserName: "Guest",
        createdAt: "2026-03-15T00:00:00.000Z",
        expiresAt: "2026-03-15T00:05:00.000Z"
      }),
      "guest",
      "2026-03-15T00:00:10.000Z"
    );

    match = applyMoveToMatch(match, { row: 7, col: 7, userId: "host", movedAt: "2026-03-15T00:00:20.000Z" });
    expect(match.currentTurn).toBe("white");
    expect(() => applyMoveToMatch(match, { row: 7, col: 8, userId: "host" })).toThrow("还没轮到你");

    match = applyMoveToMatch(match, { row: 0, col: 0, userId: "guest" });
    match = applyMoveToMatch(match, { row: 7, col: 8, userId: "host" });
    match = applyMoveToMatch(match, { row: 0, col: 1, userId: "guest" });
    match = applyMoveToMatch(match, { row: 7, col: 9, userId: "host" });
    match = applyMoveToMatch(match, { row: 0, col: 2, userId: "guest" });
    match = applyMoveToMatch(match, { row: 7, col: 10, userId: "host" });
    match = applyMoveToMatch(match, { row: 0, col: 3, userId: "guest" });
    match = applyMoveToMatch(match, { row: 7, col: 11, userId: "host" });

    expect(match.status).toBe("completed");
    expect(match.winner).toBe("black");
  });
});
