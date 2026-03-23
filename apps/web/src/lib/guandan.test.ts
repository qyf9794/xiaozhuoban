import { describe, expect, it } from "vitest";
import {
  acceptMatch,
  autoReturnTributesIfNeeded,
  canBeatCombo,
  createPendingMatch,
  detectCombo,
  normalizeGuandanState,
  passTurn,
  startMatch,
  submitPlay,
  submitTribute,
  type GuandanCard,
  type GuandanMatch,
  type GuandanPlayerState
} from "./guandan";
import {
  matchToInsertPayload,
  normalizeGuandanMatchRow,
  toGuandanOnlineError,
  type GuandanMatchRow
} from "./guandanOnline";

function card(id: string, suit: GuandanCard["suit"], rank: number): GuandanCard {
  const labelMap: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A", 15: "小王", 16: "大王" };
  return {
    id,
    deck: 0,
    suit,
    rank,
    label: suit === "joker" ? (labelMap[rank] ?? String(rank)) : `${suit[0]}${labelMap[rank] ?? rank}`
  };
}

function startedMatch(random = () => 0.5) {
  const pending = createPendingMatch({
    hostUserId: "p0",
    hostUserName: "P0",
    invitees: [
      { userId: "p1", userName: "P1" },
      { userId: "p2", userName: "P2" },
      { userId: "p3", userName: "P3" }
    ],
    createdAt: "2026-03-23T00:00:00.000Z"
  });
  const accepted1 = acceptMatch(pending, "p1", "2026-03-23T00:00:10.000Z");
  const accepted2 = acceptMatch(accepted1, "p2", "2026-03-23T00:00:20.000Z");
  const accepted3 = acceptMatch(accepted2, "p3", "2026-03-23T00:00:30.000Z");
  return startMatch(accepted3, "p0", "2026-03-23T00:01:00.000Z", random);
}

function player(userId: string, seat: number, hand: GuandanCard[], finished = false, finishOrder: number | null = null): GuandanPlayerState {
  return {
    userId,
    userName: userId.toUpperCase(),
    seat,
    team: seat % 2 === 0 ? 0 : 1,
    hand,
    handCount: hand.length,
    reportedCount: null,
    finished,
    finishOrder
  };
}

describe("guandan combos", () => {
  it("uses the heart level card as wildcard for triples", () => {
    const combo = detectCombo([card("h7", "hearts", 7), card("s9", "spades", 9), card("c9", "clubs", 9)], 7);
    expect(combo?.type).toBe("triple");
    expect(combo?.primaryRank).toBe(9);
  });

  it("detects straight flush with wildcard completion", () => {
    const combo = detectCombo(
      [card("s10", "spades", 10), card("s11", "spades", 11), card("s12", "spades", 12), card("s13", "spades", 13), card("h7", "hearts", 7)],
      7
    );
    expect(combo?.type).toBe("straight_flush");
    expect(combo?.primaryRank).toBe(14);
  });

  it("treats A as the high end of a straight", () => {
    const combo = detectCombo(
      [card("a10", "spades", 10), card("a11", "hearts", 11), card("a12", "clubs", 12), card("a13", "diamonds", 13), card("a14", "spades", 14)],
      7
    );
    expect(combo?.type).toBe("straight");
    expect(combo?.primaryRank).toBe(14);
  });

  it("treats A as 1 in low straights and straight flushes", () => {
    const straight = detectCombo(
      [card("l14", "spades", 14), card("l2", "hearts", 2), card("l3", "clubs", 3), card("l4", "diamonds", 4), card("l5", "spades", 5)],
      7
    );
    const straightFlush = detectCombo(
      [card("f14", "spades", 14), card("f2", "spades", 2), card("f3", "spades", 3), card("f4", "spades", 4), card("f5", "spades", 5)],
      7
    );
    expect(straight?.type).toBe("straight");
    expect(straight?.primaryRank).toBe(5);
    expect(straightFlush?.type).toBe("straight_flush");
    expect(straightFlush?.primaryRank).toBe(5);
  });

  it("applies bomb ladder ordering", () => {
    const bomb6 = detectCombo([card("a", "spades", 9), card("b", "clubs", 9), card("c", "diamonds", 9), card("d", "hearts", 9), card("e", "spades", 9), card("f", "clubs", 9)], 7)!;
    const flush = detectCombo([card("g", "spades", 8), card("h", "spades", 9), card("i", "spades", 10), card("j", "spades", 11), card("k", "spades", 12)], 7)!;
    const kings = detectCombo([card("l", "joker", 15), card("m", "joker", 15), card("n", "joker", 16), card("o", "joker", 16)], 7)!;
    expect(canBeatCombo(bomb6, flush, 7)).toBe(true);
    expect(canBeatCombo(kings, bomb6, 7)).toBe(true);
  });

  it("treats the current level as higher than A in ordinary comparisons", () => {
    const levelPair = detectCombo([card("l1", "spades", 2), card("l2", "clubs", 2)], 2)!;
    const acePair = detectCombo([card("a1", "spades", 14), card("a2", "clubs", 14)], 2)!;
    expect(canBeatCombo(levelPair, acePair, 2)).toBe(true);
  });
});

describe("guandan gameplay", () => {
  it("rejects weaker responses", () => {
    const started = startedMatch();
    const match: GuandanMatch = {
      ...started,
      state: {
        ...started.state,
        currentLevel: 7,
        currentTurnPlayerId: "p0",
        players: [
          player("p0", 0, [card("a1", "spades", 9), card("a2", "clubs", 9)]),
          player("p1", 1, [card("b1", "spades", 3)]),
          player("p2", 2, [card("c1", "spades", 4)]),
          player("p3", 3, [card("d1", "spades", 5)])
        ],
        currentTrick: {
          leaderPlayerId: "p1",
          currentPlayerId: "p0",
          currentCombo: { type: "pair", family: "ordinary", length: 2, primaryRank: 10, bombSize: 0, display: "对子 10" },
          lastPlayPlayerId: "p1",
          passCount: 0,
          plays: []
        }
      }
    };
    expect(() => submitPlay(match, { userId: "p0", cardIds: ["a1", "a2"] })).toThrow("无法压过牌桌");
  });

  it("auto reports when the hand drops to ten cards", () => {
    const started = startedMatch();
    const hand = [
      card("1", "spades", 3),
      card("2", "spades", 4),
      card("3", "spades", 5),
      card("4", "spades", 6),
      card("5", "spades", 7),
      card("6", "spades", 8),
      card("7", "spades", 9),
      card("8", "spades", 10),
      card("9", "spades", 11),
      card("10", "spades", 12),
      card("11", "spades", 13)
    ];
    const match: GuandanMatch = {
      ...started,
      state: {
        ...started.state,
        currentLevel: 2,
        currentTurnPlayerId: "p0",
        players: [
          player("p0", 0, hand),
          player("p1", 1, [card("b1", "spades", 14)]),
          player("p2", 2, [card("c1", "clubs", 14)]),
          player("p3", 3, [card("d1", "diamonds", 14)])
        ]
      }
    };
    const next = submitPlay(match, { userId: "p0", cardIds: ["1"] });
    expect(next.state.players[0]?.reportedCount).toBe(10);
    expect(next.state.eventLog.some((item) => item.includes("报 10"))).toBe(true);
  });

  it("creates a single tribute round when head and third are teammates", () => {
    const started = startedMatch(() => 0.5);
    const match: GuandanMatch = {
      ...started,
      state: {
        ...started.state,
        currentLevel: 2,
        currentTurnPlayerId: "p1",
        finishingOrder: ["p0"],
        players: [
          player("p0", 0, [], true, 1),
          player("p1", 1, [card("b1", "spades", 8)]),
          player("p2", 2, [card("c1", "spades", 9)]),
          player("p3", 3, [card("d1", "spades", 10)])
        ]
      }
    };

    const second = submitPlay(match, { userId: "p1", cardIds: ["b1"], random: () => 0.5 });
    const completed = submitPlay(second, { userId: "p2", cardIds: ["c1"], random: () => 0.5 });

    expect(completed.phase).toBe("tribute");
    expect(completed.state.lastRoundSummary?.nextTributeMode).toBe("single");
    expect(completed.state.tributeState.mode).toBe("single");
  });

  it("triggers anti tribute on double down when losers collectively hold two big jokers", () => {
    const started = startedMatch(() => 0.999999);
    const match: GuandanMatch = {
      ...started,
      state: {
        ...started.state,
        currentLevel: 2,
        currentTurnPlayerId: "p0",
        finishingOrder: ["p2"],
        players: [
          player("p0", 0, [card("a1", "spades", 9)]),
          player("p1", 1, [card("b1", "spades", 10)]),
          player("p2", 2, [], true, 1),
          player("p3", 3, [card("d1", "spades", 11)])
        ]
      }
    };

    const second = submitPlay(match, { userId: "p0", cardIds: ["a1"], random: () => 0.999999 });
    const completed = submitPlay(second, { userId: "p1", cardIds: ["b1"], random: () => 0.999999 });

    expect(completed.phase).toBe("playing");
    expect(completed.state.tributeState.mode).toBe("anti");
    expect(completed.state.tributeState.antiTribute).toBe(true);
  });

  it("stays at A when the winning team head-ships but partner is last", () => {
    const started = startedMatch(() => 0.5);
    const match: GuandanMatch = {
      ...started,
      state: {
        ...started.state,
        currentLevel: 14,
        currentTurnPlayerId: "p0",
        finishingOrder: ["p2", "p1", "p3"],
        players: [
          player("p0", 0, [card("a1", "spades", 12)]),
          player("p1", 1, [], true, 2),
          player("p2", 2, [], true, 1),
          player("p3", 3, [], true, 3)
        ]
      }
    };

    const next = submitPlay(match, { userId: "p0", cardIds: ["a1"], random: () => 0.5 });

    expect(next.status).toBe("active");
    expect(next.phase).toBe("playing");
    expect(next.state.currentLevel).toBe(14);
  });

  it("returns the tribute card automatically when no legal return card exists", () => {
    const started = startedMatch();
    const match: GuandanMatch = {
      ...started,
      phase: "tribute",
      state: {
        ...started.state,
        currentLevel: 7,
        players: [
          player("p0", 0, [card("r1", "spades", 14), card("r2", "clubs", 13)]),
          player("p1", 1, [card("t1", "joker", 16), card("t2", "joker", 15)]),
          player("p2", 2, [card("x1", "spades", 3)]),
          player("p3", 3, [card("x2", "spades", 4)])
        ],
        tributeState: {
          mode: "single",
          starterPlayerId: "p0",
          antiTribute: false,
          requirements: [
            {
              tributerId: "p1",
              receiverId: "p0",
              tributeCardId: null,
              returnCardId: null,
              status: "pending_tribute"
            }
          ]
        }
      }
    };

    const afterTribute = submitTribute(match, { userId: "p1", cardId: "t1" });
    const resolved = autoReturnTributesIfNeeded(afterTribute);

    expect(resolved.phase).toBe("playing");
    expect(resolved.state.players[0]?.hand.some((item) => item.id === "t1")).toBe(false);
    expect(resolved.state.players[1]?.hand.some((item) => item.id === "t1")).toBe(true);
  });

  it("rejects passing on an empty table", () => {
    const started = startedMatch();
    expect(() => passTurn(started, "p0")).toThrow("当前牌桌为空");
  });
});

describe("guandan online helpers", () => {
  it("normalizes rows and insert payloads", () => {
    const started = startedMatch();
    const row = matchToInsertPayload(started) as GuandanMatchRow;
    const normalized = normalizeGuandanMatchRow(row);
    expect(normalized.id).toBe(started.id);
    expect(normalized.state.players).toHaveLength(4);
    expect(normalizeGuandanState(row.state).currentLevel).toBe(2);
  });

  it("surfaces missing table errors clearly", () => {
    const error = toGuandanOnlineError({ message: "relation public.guandan_matches does not exist", code: "42P01" });
    expect(error.message).toContain("guandan_matches");
  });
});
