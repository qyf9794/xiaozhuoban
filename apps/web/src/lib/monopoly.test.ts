import { describe, expect, it } from "vitest";
import {
  acceptMatch,
  abandonMatch,
  createPendingMatch,
  getLiquidationValue,
  getRentForLevel,
  MONOPOLY_FATE_CARDS,
  MONOPOLY_STARTING_CASH,
  MONOPOLY_TILES,
  purchaseProperty,
  sellProperty,
  restartMatch,
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
    expect(rolled.state.players[0]?.cash).toBe(MONOPOLY_STARTING_CASH + 100);
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
    expect(purchased.state.players[0]?.cash).toBe(MONOPOLY_STARTING_CASH + 100 - 100);
  });

  it("offers upgrading when landing on owned property and increases rent", () => {
    const started = createStartedTwoPlayerMatch();
    const purchased = purchaseProperty(
      submitRoll(
        {
          ...started,
          state: {
            ...started.state,
            players: started.state.players.map((player, index) => (index === 0 ? { ...player, position: 23 } : { ...player }))
          }
        },
        { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" }
      ),
      "host",
      "2026-03-19T00:03:10.000Z"
    );

    const revisit: MonopolyMatch = {
      ...purchased,
      state: {
        ...purchased.state,
        currentPlayerIndex: 0,
        players: [
          { ...purchased.state.players[0]!, position: 23 },
          { ...purchased.state.players[1]! }
        ]
      }
    };

    const upgradeDecision = submitRoll(revisit, { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:04:00.000Z" });
    expect(upgradeDecision.phase).toBe("await_purchase_decision");
    expect(upgradeDecision.state.pendingDecision?.type).toBe("upgrade");
    expect(upgradeDecision.state.pendingDecision?.nextLevel).toBe(1);

    const upgraded = purchaseProperty(upgradeDecision, "host", "2026-03-19T00:04:10.000Z");
    expect(upgraded.state.propertyLevels["1"]).toBe(1);
    expect(getRentForLevel(MONOPOLY_TILES[1]!, 1)).toBeGreaterThan(MONOPOLY_TILES[1]!.rent ?? 0);

    const secondRevisit: MonopolyMatch = {
      ...upgraded,
      state: {
        ...upgraded.state,
        currentPlayerIndex: 0,
        players: [
          { ...upgraded.state.players[0]!, position: 23 },
          { ...upgraded.state.players[1]! }
        ]
      }
    };
    const secondUpgradeDecision = submitRoll(secondRevisit, { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:05:00.000Z" });
    expect(secondUpgradeDecision.state.pendingDecision?.type).toBe("upgrade");
    expect(secondUpgradeDecision.state.pendingDecision?.nextLevel).toBe(2);

    const maxed = purchaseProperty(secondUpgradeDecision, "host", "2026-03-19T00:05:10.000Z");
    expect(maxed.state.propertyLevels["1"]).toBe(2);

    const thirdRevisit: MonopolyMatch = {
      ...maxed,
      state: {
        ...maxed.state,
        currentPlayerIndex: 0,
        players: [
          { ...maxed.state.players[0]!, position: 23 },
          { ...maxed.state.players[1]! }
        ]
      }
    };
    const noUpgrade = submitRoll(thirdRevisit, { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:06:00.000Z" });
    expect(noUpgrade.phase).toBe("await_roll");
    expect(noUpgrade.state.pendingDecision).toBeNull();
  });

  it("allows selling another owned property when cash is insufficient for an upgrade", () => {
    const started = createStartedTwoPlayerMatch();
    const host = started.state.players[0]!;
    const guest = started.state.players[1]!;
    const adjusted: MonopolyMatch = {
      ...started,
      state: {
        ...started.state,
        currentPlayerIndex: 0,
        players: [
          {
            ...host,
            cash: 20,
            position: 3,
            propertyIds: [1, 3]
          },
          guest
        ],
        propertyOwners: {
          "1": "host",
          "3": "host"
        },
        propertyLevels: {
          "1": 1,
          "3": 1
        },
        pendingDecision: {
          type: "upgrade",
          playerId: "host",
          tileIndex: 3,
          price: 102,
          nextLevel: 2
        }
      },
      phase: "await_purchase_decision"
    };

    const liquidated = sellProperty(adjusted, "host", 1, "2026-03-19T00:03:05.000Z");
    const saleValue = getLiquidationValue(MONOPOLY_TILES[1]!, 1);

    expect(liquidated.phase).toBe("await_purchase_decision");
    expect(liquidated.state.players[0]?.cash).toBe(20 + saleValue);
    expect(liquidated.state.players[0]?.propertyIds).toEqual([3]);
    expect(liquidated.state.propertyOwners["1"]).toBeUndefined();
    expect(liquidated.state.pendingDecision?.tileIndex).toBe(3);

    const upgraded = purchaseProperty(liquidated, "host", "2026-03-19T00:03:10.000Z");
    expect(upgraded.state.propertyLevels["3"]).toBe(2);
  });

  it("enters debt settlement instead of immediate bankruptcy when the player still has assets", () => {
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
            position: 1,
            propertyIds: [1]
          }
        ],
        propertyOwners: { "1": "guest", "3": "host" }
      }
    };

    const rolled = submitRoll(adjusted, { userId: "guest", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" });

    expect(rolled.status).toBe("active");
    expect(rolled.phase).toBe("await_purchase_decision");
    expect(rolled.state.players[1]?.bankrupt).toBe(false);
    expect(rolled.state.pendingDecision?.type).toBe("debt_settlement");
    expect(rolled.state.pendingDecision?.price).toBeGreaterThan(10);
  });

  it("bankrupts a player only when cash is insufficient and no assets remain", () => {
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
            position: 1,
            propertyIds: []
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
    expect(rolled.state.players[0]?.cash).toBe(MONOPOLY_STARTING_CASH + 100);
    expect(rolled.state.lastEvent).toContain("回到起点");
  });

  it("records forward roll then backward card movement as separate segments", () => {
    const started = createStartedTwoPlayerMatch();
    const adjusted: MonopolyMatch = {
      ...started,
      state: {
        ...started.state,
        chanceDeck: ["chance_back_two"],
        players: started.state.players.map((player, index) => (index === 0 ? { ...player, position: 6 } : { ...player }))
      }
    };

    const rolled = submitRoll(adjusted, { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" });

    expect(rolled.state.players[0]?.position).toBe(6);
    expect(rolled.state.lastMovement).toEqual({
      playerId: "host",
      segments: [
        { from: 6, to: 8, backward: false },
        { from: 8, to: 6, backward: true }
      ]
    });
    expect(rolled.state.lastEvent).toContain("后退 2 格");
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

  it("lets the host restart an active game with the same participants", () => {
    const started = createStartedTwoPlayerMatch();
    const progressed = submitRoll(
      {
        ...started,
        state: {
          ...started.state,
          players: started.state.players.map((player, index) => (index === 0 ? { ...player, position: 23 } : player))
        }
      },
      { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" }
    );

    const restarted = restartMatch(progressed, "host", "2026-03-19T00:04:00.000Z", () => 0.5);

    expect(restarted.status).toBe("active");
    expect(restarted.phase).toBe("await_roll");
    expect(restarted.state.currentRound).toBe(1);
    expect(restarted.state.players.map((player) => ({ userId: player.userId, cash: player.cash, position: player.position }))).toEqual([
      { userId: "host", cash: MONOPOLY_STARTING_CASH, position: 0 },
      { userId: "guest", cash: MONOPOLY_STARTING_CASH, position: 0 }
    ]);
    expect(restarted.state.propertyOwners).toEqual({});
    expect(restarted.state.lastEvent).toContain("重新开始");
  });

  it("cancels the room when any participant closes the widget", () => {
    const started = createStartedTwoPlayerMatch();

    const abandoned = abandonMatch(started, "guest", "2026-03-19T00:05:00.000Z");

    expect(abandoned.status).toBe("cancelled");
    expect(abandoned.phase).toBe("completed");
    expect(abandoned.finishedAt).toBe("2026-03-19T00:05:00.000Z");
    expect(abandoned.state.lastEvent).toContain("关闭了大富翁");
  });
});

describe("monopoly online helpers", () => {
  it("serializes and normalizes match rows", () => {
    const started = createStartedTwoPlayerMatch();
    const match = submitRoll(
      {
        ...started,
        state: {
          ...started.state,
          chanceDeck: ["chance_back_two"],
          players: started.state.players.map((player, index) => (index === 0 ? { ...player, position: 6 } : { ...player }))
        }
      },
      { userId: "host", dice: [1, 1], rolledAt: "2026-03-19T00:03:00.000Z" }
    );
    const row = matchToInsertPayload(match) as MonopolyMatchRow;
    const normalized = normalizeMonopolyMatchRow(row);

    expect(normalized.participantIds).toEqual(["host", "guest"]);
    expect(normalized.state.players).toHaveLength(2);
    expect(normalized.state.lastMovement?.segments).toHaveLength(2);
    expect(rowMatchesUser(row, "guest")).toBe(true);
  });

  it("maps missing-table errors to a setup hint", () => {
    const error = toMonopolyOnlineError({ message: "relation public.monopoly_matches does not exist", code: "42P01" });
    expect(error.message).toContain("monopoly_matches");
  });
});
