import type { Log } from "viem";
import type { PublicGameEvent } from "./publicEvent.js";

type DecodedLog = Log & { eventName?: string; args?: Record<string, unknown> };

/**
 * Turns one decoded on-chain log into the narrator's PublicGameEvent, or
 * null if it isn't narrator-worthy. This is the single place a contract
 * event crosses into what the AI is allowed to see -- see publicEvent.ts
 * for why the return type is the enforcement mechanism, not a convention.
 *
 * Deliberately unmapped (return null): NightActionSubmitted (who targeted
 * whom during the night -- public, but narrating it live would just be
 * noise, not a leak), NightResolving / DayLynchResolving (internal
 * reveal-pending markers, not story beats), NewRound (lobby reset).
 */
export function toPublicEvent(log: DecodedLog): PublicGameEvent | null {
  switch (log.eventName) {
    case "Joined": {
      const { player } = log.args as { player: `0x${string}` };
      return { kind: "player_joined", player, totalPlayers: -1 }; // filled in by caller
    }
    case "RolesAssigned": {
      const { players, mafia } = log.args as { players: number; mafia: number };
      return { kind: "roles_assigned", players: Number(players), mafiaCount: Number(mafia), round: 0 }; // round filled in by caller
    }
    case "NightStarted": {
      const { round } = log.args as { round: bigint };
      return { kind: "night_started", round: Number(round) };
    }
    case "NightSkipped":
      return { kind: "night_skipped" };
    case "PlayerDied": {
      const { player, wasMafia, cause } = log.args as {
        player: `0x${string}`;
        wasMafia: boolean;
        cause: "night" | "day";
      };
      return { kind: "player_died", player, wasMafia, cause };
    }
    case "DayStarted": {
      const { round } = log.args as { round: bigint };
      return { kind: "day_started", round: Number(round) };
    }
    case "DayVoteCast": {
      const { voter, target } = log.args as { voter: `0x${string}`; target: `0x${string}` };
      return { kind: "day_vote_cast", voter, target };
    }
    case "GameEnded": {
      const { winner } = log.args as { winner: number };
      return { kind: "game_ended", winner: winner === 1 ? "Town" : "Mafia" };
    }
    default:
      return null;
  }
}
