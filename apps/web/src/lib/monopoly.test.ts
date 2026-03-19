import { describe, expect, it } from "vitest";
import {
  acceptMatch,
  createPendingMatch,
  MONOPOLY_FATE_CARDS,
  MONOPOLY_STARTING_CASH,
  purchaseProperty,
  startMatch,
  submitRoll,
  type MonopolyMatch
} from "./monopoly";
import {
  matchToInsertPayload,
  normalizeMonopolyMatchRow,
  rowMatchesUser,
  toMonopolyOnlineError,
  type MonopolyMatchRow
} from "./monopolyOnline";

function createStartedTwoPlayerMatch() {
  const pending = createPendingMatch({
    hostUserId: "host",
    hostUserName: "Host",
    invitees: [
      { userId: "guest", userName: "Guest" },
      { userId: "watcher", userName: "Watcher" }
    ],
    createdAt: "2026-03-19T00:00:00.000Z"
  });
  const accepted = acceptMatch(pending, "guest", "2026-03-19T00:01:00.000Z");
  return startMatch(accepted, "host", "2026-03-19T00:02:00.000Z", () => 0.5);
}

describe("monopoly lobby", () => {
  it("starts with accepted players only and trims participant ids", () => {
    const match = createStartedTwoPlayerMatch();

    expect(match.status).toBe("active");
    expect(match.phase).toBe("await_roll");
    expect(match.participantIds).toEqual(["host", "guest"]);
    expect(match.state.players.map((player) => player.userId)).toEqual(["host", "guest"]);
    expect(match.state.currentRound).toBe(1);
  });
});

describe("monopoly gameplay", () => {
  it("rewards crossing start and creates a purchase decision", () => {
    const started = createStartedTwoPlayerMatch();
    const host = started.state.players[0]!;
    const adjusted: MonopolyMatch = {
      ...started,
      state: {
        ...started.state,
        players: [
          { ...host, position: 23 },
          { ...started.state.players[1]! }
        ]
      }
    };

    const rolled = submitRoll(adjusted, { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" });

    expect(rolled.phase).toBe("await_purchase_decision");
    expect(rolled.state.players[0]?.position).toBe(1);
    expect(rolled.state.players[0]?.cash).toBe(MONOPOLY_STARTING_CASH + 200);
    expect(rolled.state.pendingDecision?.tileIndex).toBe(1);
  });

  it("buys property and records ownership", () => {
    const started = createStartedTwoPlayerMatch();
    const adjusted: MonopolyMatch = {
      ...started,
      state: {
        ...started.state,
        players: started.state.players.map((player, index) => (index === 0 ? { ...player, position: 23 } : { ...player }))
      }
    };

    const rolled = submitRoll(adjusted, { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" });
    const purchased = purchaseProperty(rolled, "host", "2026-03-19T00:03:10.000Z");

    expect(purchased.phase).toBe("await_roll");
    expect(purchased.state.currentPlayerIndex).toBe(1);
    expect(purchased.state.propertyOwners["1"]).toBe("host");
    expect(purchased.state.players[0]?.propertyIds).toEqual([1]);
    expect(purchased.state.players[0]?.cash).toBe(MONOPOLY_STARTING_CASH + 100);
  });

  it("applies rent and bankrupts a player when cash is insufficient", () => {
    const started = createStartedTwoPlayerMatch();
    const adjusted: MonopolyMatch = {
      ...started,
      state: {
        ...started.state,
        currentPlayerIndex: 1,
        players: [
          {
            ...started.state.players[0]!,
            cash: MONOPOLY_STARTING_CASH,
            propertyIds: [3]
          },
          {
            ...started.state.players[1]!,
            cash: 10,
            position: 1
          }
        ],
        propertyOwners: { "3": "host" }
      }
    };

    const rolled = submitRoll(adjusted, { userId: "guest", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" });

    expect(rolled.status).toBe("completed");
    expect(rolled.phase).toBe("completed");
    expect(rolled.state.players[1]?.bankrupt).toBe(true);
    expect(rolled.state.players[1]?.cash).toBe(0);
    expect(rolled.state.players[0]?.cash).toBe(MONOPOLY_STARTING_CASH + 10);
  });

  it("applies movement card effects and start rewards", () => {
    const started = createStartedTwoPlayerMatch();
    const adjusted: MonopolyMatch = {
      ...started,
      state: {
        ...started.state,
        chanceDeck: ["chance_to_start"],
        players: started.state.players.map((player, index) => (index === 0 ? { ...player, position: 6 } : { ...player }))
      }
    };

    const rolled = submitRoll(adjusted, { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" });

    expect(rolled.state.players[0]?.position).toBe(0);
    expect(rolled.state.players[0]?.cash).toBe(MONOPOLY_STARTING_CASH + 200);
    expect(rolled.state.lastEvent).toContain("回到起点");
  });

  it("applies fate cash card effects", () => {
    const started = createStartedTwoPlayerMatch();
    const cashCardId = MONOPOLY_FATE_CARDS.find((card) => (card.amount ?? 0) > 0)?.id ?? "fate_cash_bonus";
    const adjusted: MonopolyMatch = {
      ...started,
      state: {
        ...started.state,
        fateDeck: [cashCardId],
        players: started.state.players.map((player, index) => (index === 0 ? { ...player, position: 12 } : { ...player }))
      }
    };

    const rolled = submitRoll(adjusted, { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" });

    expect(rolled.state.players[0]?.cash).toBeGreaterThan(MONOPOLY_STARTING_CASH);
    expect(rolled.state.lastEvent).toContain("抽到命运卡");
  });

  it("continues after round wrap and only ends when one player remains", () => {
    const started = createStartedTwoPlayerMatch();
    const adjusted: MonopolyMatch = {
      ...started,
      state: {
        ...started.state,
        currentRound: 12,
        currentPlayerIndex: 1,
        players: [
          { ...started.state.players[0]! },
          { ...started.state.players[1]!, position: 10 }
        ]
      }
    };

    const next = submitRoll(adjusted, { userId: "guest", dice: [1, 1], rolledAt: "2026-03-19T00:10:00.000Z" });

    expect(next.status).toBe("active");
    expect(next.phase).toBe("await_roll");
    expect(next.state.currentRound).toBe(13);
  });
});

describe("monopoly online helpers", () => {
  it("serializes and normalizes match rows", () => {
    const match = createStartedTwoPlayerMatch();
    const row = matchToInsertPayload(match) as MonopolyMatchRow;
    const normalized = normalizeMonopolyMatchRow(row);

    expect(normalized.participantIds).toEqual(["host", "guest"]);
    expect(normalized.state.players).toHaveLength(2);
    expect(rowMatchesUser(row, "guest")).toBe(true);
  });

  it("maps missing-table errors to a setup hint", () => {
    const error = toMonopolyOnlineError({ message: "relation public.monopoly_matches does not exist", code: "42P01" });
    expect(error.message).toContain("monopoly_matches");
  });
});
