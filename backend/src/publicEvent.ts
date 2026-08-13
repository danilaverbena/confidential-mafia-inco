/**
 * The ONLY shape of data the narrator is ever allowed to see.
 *
 * This is the confidentiality boundary of the whole project: every field
 * here is something the contract has already revealed on-chain (a phase
 * change, a join, a death, a public day-vote, the game's winner). Nothing
 * here can ever be a private role handle, a night-action target, or an
 * unsettled encrypted value -- those never leave the contract/client in
 * plaintext, so they physically cannot reach this type. If you find
 * yourself wanting to add a field like "role" or "nightTarget" here, stop:
 * that value must stay inside the contract until *it* reveals it (see
 * ConfidentialMafia.sol).
 */
export type PublicGameEvent =
  | { kind: "player_joined"; player: string; totalPlayers: number }
  | { kind: "roles_assigned"; players: number; mafiaCount: number; round: number }
  | { kind: "night_started"; round: number }
  | { kind: "night_skipped" }
  | { kind: "player_died"; player: string; wasMafia: boolean; cause: "night" | "day" }
  | { kind: "day_started"; round: number }
  | { kind: "day_vote_cast"; voter: string; target: string }
  | { kind: "game_ended"; winner: "Town" | "Mafia" };
