// Reads Ignition's deployed addresses and writes them into frontend/.env.local.
// Usage: node scripts/wire-frontend.mjs [chainId]   (default 84532 = Base Sepolia)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chainId = process.argv[2] || "84532";
const deployed = join(root, "ignition", "deployments", `chain-${chainId}`, "deployed_addresses.json");

if (!existsSync(deployed)) {
  console.error(`No deployment found at ${deployed}. Deploy first (npm run deploy:examples:testnet).`);
  process.exit(1);
}

const addrs = JSON.parse(readFileSync(deployed, "utf8"));
const pick = (key) => addrs[`${key}#${key}`] || "";

const map = {
  NEXT_PUBLIC_WAR_ADDRESS: pick("War"),
  NEXT_PUBLIC_BLACKJACK_ADDRESS: pick("Blackjack"),
  NEXT_PUBLIC_RAFFLE_ADDRESS: pick("Raffle"),
  NEXT_PUBLIC_MAFIA_ADDRESS: pick("Mafia"),
};

const envPath = join(root, "frontend", ".env.local");
let lines = existsSync(envPath)
  ? readFileSync(envPath, "utf8").split("\n")
  : readFileSync(join(root, "frontend", ".env.example"), "utf8").split("\n");

for (const [key, value] of Object.entries(map)) {
  if (!value) continue;
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  const line = `${key}=${value}`;
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
}

writeFileSync(envPath, lines.join("\n"));
console.log("Wrote deployed addresses to frontend/.env.local:");
for (const [k, v] of Object.entries(map)) console.log(`  ${k}=${v || "(not deployed)"}`);
