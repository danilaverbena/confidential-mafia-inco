// Records a real playthrough of the Mini App for the demo video.
//
// The app needs a wallet, and a demo recording can't stop to scan a
// WalletConnect QR. So this injects a minimal EIP-1193 provider as
// `window.ethereum`: read calls are forwarded to the Base Sepolia RPC, and
// eth_sendTransaction is signed in Node with a real testnet key and broadcast
// for real. Nothing is faked -- the transactions in the recording are genuine
// Base Sepolia transactions against the deployed contract, and the encrypted
// role the UI reveals is a genuine Inco attested decrypt. Only the wallet *UI*
// is bypassed.
//
// Usage: node record-demo.js <outDir>

const puppeteer = require("puppeteer");
const {
  createWalletClient,
  createPublicClient,
  http,
  hexToBigInt,
} = require("viem");
const { baseSepolia } = require("viem/chains");
const { privateKeyToAccount } = require("viem/accounts");

const RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const KEY = process.env.DEMO_PRIVATE_KEY;
const BASE_URL = process.env.DEMO_APP_URL || "https://confidential-mafia-inco.vercel.app";
const OUT = process.argv[2] || "/tmp/demo";

if (!KEY) {
  console.error("DEMO_PRIVATE_KEY required");
  process.exit(1);
}

const account = privateKeyToAccount(KEY);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/snap/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=900,1400",
      "--force-device-scale-factor=2",
      "--hide-scrollbars",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1400, deviceScaleFactor: 2 });

  // --- Node-side signer, callable from the page -------------------------------
  await page.exposeFunction("__rpc", async (method, params) => {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return "0x14a34"; // 84532
      case "net_version":
        return "84532";
      case "eth_sendTransaction": {
        const t = params[0];
        const hash = await wallet.sendTransaction({
          to: t.to,
          data: t.data,
          value: t.value ? hexToBigInt(t.value) : undefined,
          // The app already supplies explicit gas (Inco precompiles break
          // eth_estimateGas); fall back to a generous limit if it doesn't.
          gas: t.gas ? hexToBigInt(t.gas) : 3_000_000n,
        });
        console.log(`   tx ${method}: ${hash}`);
        return hash;
      }
      case "personal_sign":
      case "eth_sign": {
        // Inco's attestedDecrypt asks the wallet to sign a message proving key
        // ownership -- that's what authorizes decrypting *this* player's role.
        const [a, b] = params;
        const message = method === "personal_sign" ? a : b;
        return account.signMessage({ message: { raw: message } });
      }
      case "eth_signTypedData_v4": {
        const data = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        return account.signTypedData(data);
      }
      default: {
        const r = await fetch(RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }),
        });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return j.result;
      }
    }
  });

  // --- Inject the provider before any app code runs ---------------------------
  await page.evaluateOnNewDocument((addr) => {
    const listeners = {};
    const provider = {
      isMetaMask: true,
      _isDemoWallet: true,
      selectedAddress: addr,
      chainId: "0x14a34",
      request: ({ method, params }) => window.__rpc(method, params),
      send: (m, p) => window.__rpc(m, p),
      sendAsync: (payload, cb) =>
        window.__rpc(payload.method, payload.params).then(
          (r) => cb(null, { id: payload.id, jsonrpc: "2.0", result: r }),
          (e) => cb(e)
        ),
      on: (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn), provider),
      removeListener: () => provider,
      enable: () => window.__rpc("eth_requestAccounts"),
    };
    window.ethereum = provider;

    // EIP-6963 so wagmi discovers it as an injected wallet.
    const detail = Object.freeze({
      info: {
        uuid: "11111111-2222-3333-4444-555555555555",
        name: "Demo Wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        rdns: "io.metamask",
      },
      provider,
    });
    const announce = () =>
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, account.address);

  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail/i.test(t) && !/favicon/i.test(t)) console.log(`   [page] ${t.slice(0, 160)}`);
  });

  const url = `${BASE_URL}/confidential-mafia`;
  console.log(`opening ${url} as ${account.address}`);

  const recorder = await page.screencast({ path: `${OUT}/${process.env.SEG || "raw"}.webm`, fps: 30 });

  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(3000);

  // Helper: click a button whose label matches, and report whether it existed.
  const click = async (re, label) => {
    const ok = await page.evaluate((src) => {
      const rx = new RegExp(src, "i");
      const b = [...document.querySelectorAll("button")].find(
        (x) => rx.test((x.textContent || "").trim()) && !x.disabled
      );
      if (!b) return false;
      b.scrollIntoView({ block: "center" });
      b.click();
      return true;
    }, re.source);
    console.log(`  ${ok ? "clicked" : "SKIP (absent/disabled)"}: ${label}`);
    return ok;
  };

  const phase = () =>
    page.evaluate(() => {
      const m = document.body.innerText.match(/PHASE:\s*(\w+)/i);
      return m ? m[1] : "?";
    });

  // 1. Connect the injected wallet.
  await click(/connect wallet/, "connect wallet");
  await sleep(2500);
  // RainbowKit lists the injected provider; pick it if a modal opened.
  await page.evaluate(() => {
    const walk = (root, d = 0) => {
      if (d > 8) return null;
      for (const el of root.querySelectorAll("*")) {
        const t = (el.textContent || "").trim();
        if (/^(Demo Wallet|MetaMask|Browser Wallet|Injected)$/i.test(t)) {
          const b = el.closest("button") || el;
          b.click();
          return true;
        }
        if (el.shadowRoot && walk(el.shadowRoot, d + 1)) return true;
      }
      return null;
    };
    walk(document);
  });
  await sleep(6000);
  console.log(`  phase after connect: ${await phase()}`);

  // 2. Walk the game forward. The AI runner handles the bots and the
  //    resolve/settle steps concurrently, so here we only do the human's part
  //    and let the UI catch up between polls.
  const steps = [
    [/join the lobby|^join$/, "join the lobby"],
    [/fund fee/, "fund shuffle fee"],
    [/reveal my role|reveal role/, "reveal my own role (Inco attested decrypt)"],
    [/submit night action/, "submit night action"],
    [/resolve night/, "resolve night"],
    [/settle night/, "settle night"],
  ];

  // The night-action submit button stays disabled until a target radio is
  // picked, so pick one (never self) before trying the step list.
  const pickNightTarget = async () => {
    const picked = await page.evaluate(() => {
      const radios = [...document.querySelectorAll('input[type=radio][name=target]')].filter(
        (r) => !r.disabled
      );
      if (!radios.length) return null;
      // Prefer a row that isn't labelled as "you".
      const notMe = radios.find((r) => {
        const row = r.closest("label") || r.parentElement;
        return row && !/\(you\)|\byou\b/i.test(row.textContent || "");
      });
      const r = notMe || radios[0];
      r.scrollIntoView({ block: "center" });
      r.click();
      const row = r.closest("label") || r.parentElement;
      return (row?.textContent || "target").trim().slice(0, 40);
    });
    if (picked) console.log(`  picked night target: ${picked}`);
    return picked;
  };

  for (let round = 0; round < 30; round++) {
    const p = await phase();
    if (/night/i.test(p)) {
      if (await pickNightTarget()) await sleep(1500);
    }
    for (const [re, label] of steps) {
      if (await click(re, label)) {
        await sleep(9000);
        break;
      }
    }
    // Vote for whoever is votable during the day.
    if (/day/i.test(p)) {
      const voted = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find(
          (x) => /vote/i.test(x.textContent || "") && !x.disabled
        );
        if (!b) return false;
        b.scrollIntoView({ block: "center" });
        b.click();
        return true;
      });
      if (voted) {
        console.log("  clicked: day vote");
        await sleep(9000);
      }
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(4000);
    console.log(`  [poll ${round}] phase=${p}`);
    if (/gameover/i.test(p)) break;
  }

  await sleep(3000);
  await recorder.stop();
  await browser.close();
  console.log(`\nrecorded -> ${OUT}/raw.webm`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
