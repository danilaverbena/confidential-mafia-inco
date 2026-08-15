// End-to-end check of the Telegram wallet-connect path, all the way to handoff.
//
// Reown mints the `wc:` pairing URI lazily -- only once a specific wallet is
// chosen -- so asserting on the URI right after opening the modal (as an
// earlier probe did) is testing too early. This drives the real sequence:
//
//   tap "connect wallet"  ->  official Reown modal opens  ->  tap MetaMask
//   ->  URI minted  ->  handed to window.open
//
// and asserts the two things that actually have to hold inside Telegram:
//   1. a wc: pairing URI is produced at all (relay + project id are healthy)
//   2. it is opened with target "_blank" -- the one target Telegram's webview
//      will hand off to the OS. RainbowKit's own modal uses the default
//      target here, which Telegram silently drops; that difference is the
//      whole reason we route through the Reown modal inside Telegram.

const puppeteer = require("puppeteer");

const URL = process.argv[2] || "https://confidential-mafia-inco.vercel.app/confidential-mafia";

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/snap/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
  );
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });

  await page.evaluateOnNewDocument(() => {
    window.__opens = [];
    window.TelegramWebviewProxy = { postEvent: () => {} };
    window.Telegram = {
      WebApp: {
        initData: "",
        initDataUnsafe: { user: { id: 1, first_name: "Test" } },
        version: "7.0",
        platform: "android",
        ready() {},
        expand() {},
        openLink: (u) => window.__opens.push({ via: "Telegram.openLink", url: u, target: "n/a" }),
        MainButton: { text: "", show() {}, hide() {}, onClick() {} },
        themeParams: {},
      },
    };
    // Record rather than actually navigate, so the run doesn't tear itself down.
    window.open = function (url, target) {
      window.__opens.push({ via: "window.open", url: String(url), target: String(target) });
      return null;
    };
  });

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  // Step 1: open the connect flow.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /connect wallet/i.test(x.textContent || "")
    );
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 6000));

  // Step 2: pick a wallet from inside the modal's shadow DOM.
  const picked = await page.evaluate(() => {
    const found = [];
    const walk = (root, d = 0) => {
      if (d > 8) return;
      for (const el of root.querySelectorAll("*")) {
        const t = (el.textContent || "").trim();
        if (/^metamask$/i.test(t) && el.getBoundingClientRect().height > 0) found.push(el);
        if (el.shadowRoot) walk(el.shadowRoot, d + 1);
      }
    };
    walk(document);
    if (!found.length) return { ok: false };
    // Innermost match, then climb to the nearest clickable ancestor.
    let el = found[found.length - 1];
    for (let i = 0; i < 5 && el; i++) {
      const tag = el.tagName.toLowerCase();
      if (tag.includes("list-wallet") || tag === "button" || el.getAttribute("role") === "button") break;
      el = el.parentElement || (el.getRootNode() && el.getRootNode().host);
    }
    (el || found[found.length - 1]).click();
    return { ok: true, clicked: (el || found[found.length - 1]).tagName };
  });
  console.log("picked a wallet from the modal:", JSON.stringify(picked));

  await new Promise((r) => setTimeout(r, 12000));

  const opens = await page.evaluate(() => window.__opens || []);

  console.log("\n=== handoff attempts recorded ===");
  opens.forEach((o) => console.log(`  [${o.via}] target=${o.target}\n      ${o.url.slice(0, 110)}`));

  // The URI arrives percent-encoded inside the universal link, and Reown
  // encodes it twice (wc%253A...), so decode repeatedly before asserting.
  const fullyDecode = (s) => {
    let prev = s;
    for (let i = 0; i < 4; i++) {
      let next;
      try {
        next = decodeURIComponent(prev);
      } catch {
        break;
      }
      if (next === prev) break;
      prev = next;
    }
    return prev;
  };

  const wc = opens.find((o) => /wc:[a-f0-9]{20,}@/i.test(fullyDecode(o.url)));
  const blank = wc && wc.target === "_blank";
  // A custom scheme (metamask://) is what Telegram's webview rejects outright;
  // an https universal link is what it can actually hand off.
  const https = wc && wc.url.startsWith("https://");

  console.log("\n=== VERDICT ===");
  console.log("  pairing URI minted & handed off :", wc ? "YES" : "NO");
  if (wc) console.log("    decoded:", fullyDecode(wc.url).match(/wc:[^&\s]*/i)[0].slice(0, 70) + "...");
  console.log("  https universal link (not a custom scheme):", wc ? (https ? "YES" : "NO") : "n/a");
  console.log("  opened with Telegram-safe _blank:", wc ? (blank ? "YES" : `NO (${wc.target})`) : "n/a");

  const ok = wc && blank && https;
  if (ok) console.log("\n  => Wallet connect works inside Telegram.");

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
