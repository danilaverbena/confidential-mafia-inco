import "dotenv/config";
import { buildContractWatcher } from "./contract.js";
import { buildNarratorClient } from "./narrator/gemini.js";
import { buildTelegramSender } from "./telegramBot.js";
import type { PublicGameEvent } from "./publicEvent.js";

/**
 * Orchestrator: watches ConfidentialMafia's PUBLIC events on-chain, turns
 * each one into a PublicGameEvent, asks Gemini to narrate it, and posts the
 * narration to the game's Telegram chat. It never reads a role handle, a
 * night-action target, or anything else that isn't already public on-chain
 * -- see src/publicEvent.ts for why that's structurally guaranteed, not just
 * a convention.
 *
 * This file is a scaffold: it wires the pieces together and shows the event
 * -> narrate -> send flow for a couple of event types. Extend the switch in
 * handleLog() to cover every event ConfidentialMafia.sol emits
 * (RolesAssigned, NightStarted, NightSkipped, PlayerDied, DayStarted,
 * DayVoteCast, GameEnded) as you wire the real ABI in.
 */
async function main() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL!;
  const address = process.env.CONFIDENTIAL_MAFIA_ADDRESS as `0x${string}`;
  const { contract, client } = buildContractWatcher(rpcUrl, address);

  const narrator = buildNarratorClient(process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL);
  const telegram = buildTelegramSender(process.env.TELEGRAM_BOT_TOKEN!, process.env.TELEGRAM_CHAT_ID!);

  async function handle(event: PublicGameEvent) {
    const text = await narrator.narrate(event);
    await telegram.send(text);
  }

  // TODO: replace with contract.watchEvent.<EventName>() per event, mapping
  // each decoded log to a PublicGameEvent. Kept minimal here on purpose.
  console.log(`Watching ${address} on ${rpcUrl}...`);
  client.watchContractEvent({
    address,
    abi: contract.abi,
    onLogs: async (logs) => {
      for (const log of logs) {
        console.log("event:", log.eventName, log.args);
        // Map decoded logs to PublicGameEvent and call handle(event) here.
      }
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
