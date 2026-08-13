import "dotenv/config";
import { buildContractWatcher, confidentialMafiaAbi } from "./contract.js";
import { buildNarratorClient } from "./narrator/gemini.js";
import { buildTelegramSender } from "./telegramBot.js";
import { toPublicEvent } from "./eventMapper.js";
import type { PublicGameEvent } from "./publicEvent.js";

/**
 * Orchestrator: watches ConfidentialMafia's PUBLIC events on-chain, turns
 * each one into a PublicGameEvent (see eventMapper.ts / publicEvent.ts),
 * asks Gemini to narrate it, and posts the narration to the game's
 * Telegram chat. It never reads a role handle, a night-action target, or
 * anything else that isn't already public on-chain.
 */
async function main() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  const address = process.env.CONFIDENTIAL_MAFIA_ADDRESS as `0x${string}` | undefined;
  const geminiKey = process.env.GEMINI_API_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!rpcUrl || !address || !geminiKey || !botToken || !chatId) {
    throw new Error(
      "Missing one of BASE_SEPOLIA_RPC_URL / CONFIDENTIAL_MAFIA_ADDRESS / GEMINI_API_KEY / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID in .env"
    );
  }

  const { contract, client } = buildContractWatcher(rpcUrl, address);
  const narrator = buildNarratorClient(geminiKey, process.env.GEMINI_MODEL);
  const telegram = buildTelegramSender(botToken, chatId);

  console.log(`Watching ConfidentialMafia at ${address} on Base Sepolia...`);

  client.watchContractEvent({
    address,
    abi: confidentialMafiaAbi,
    onLogs: async (logs) => {
      for (const log of logs as Array<typeof logs[number] & { eventName?: string; args?: Record<string, unknown> }>) {
        console.log("event:", log.eventName, log.args);

        let event: PublicGameEvent | null = toPublicEvent(log);
        if (!event) continue;

        // A couple of event kinds need a fresh contract read to fill in a
        // field the raw log doesn't carry.
        if (event.kind === "player_joined") {
          try {
            const totalPlayers = await contract.read.playerCount();
            event = { ...event, totalPlayers: Number(totalPlayers) };
          } catch (err) {
            console.error("playerCount() read failed, using -1", err);
          }
        }
        if (event.kind === "roles_assigned") {
          try {
            const round = await contract.read.round();
            event = { ...event, round: Number(round) };
          } catch (err) {
            console.error("round() read failed, using 0", err);
          }
        }

        try {
          const text = await narrator.narrate(event);
          await telegram.send(text);
          console.log("narrated:", event.kind, "->", text);
        } catch (err) {
          console.error("narration/send failed for", event.kind, err);
        }
      }
    },
    onError: (err) => console.error("watchContractEvent error:", err),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
