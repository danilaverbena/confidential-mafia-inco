import "dotenv/config";
import { buildContractWatcher, confidentialMafiaAbi } from "../src/contract.js";
import { buildNarratorClient } from "../src/narrator/gemini.js";
import { buildTelegramSender } from "../src/telegramBot.js";
import { toPublicEvent } from "../src/eventMapper.js";
import { parseEventLogs } from "viem";

async function main() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL!;
  const address = process.env.CONFIDENTIAL_MAFIA_ADDRESS as `0x${string}`;
  const { client } = buildContractWatcher(rpcUrl, address);
  const narrator = buildNarratorClient(process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL);
  const telegram = buildTelegramSender(process.env.TELEGRAM_BOT_TOKEN!, process.env.TELEGRAM_CHAT_ID!);

  const fromBlock = BigInt(process.argv[2] ?? "0");
  console.log(`Backfilling missed events for ${address} from block ${fromBlock}...`);

  const rawLogs = await client.getLogs({ address, fromBlock, toBlock: "latest" });
  const logs = parseEventLogs({ abi: confidentialMafiaAbi, logs: rawLogs });

  for (const log of logs as Array<(typeof logs)[number] & { eventName?: string; args?: Record<string, unknown> }>) {
    console.log("log:", log.eventName, log.args);
    const event = toPublicEvent(log);
    if (!event) continue;
    const text = await narrator.narrate(event);
    await telegram.send(text);
    console.log("backfilled narration:", event.kind, "->", text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
