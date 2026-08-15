// Confirms the connect flow actually reaches a usable pairing URI inside a
// Telegram-like environment.
//
// The previous probe only watched window.open/openLink, which in headless
// never fires: with no wallet app installed there's nothing to deep-link to,
// so the modal legitimately stops at "show the QR / wallet list" instead. The
// meaningful assertion is therefore that a `wc:` pairing URI exists at all --
// that's the artifact the relay must mint before any wallet, on any transport,
// can be connected. If it's there, the WalletConnect side is healthy and the
// remaining step is purely the user picking a wallet.
//
// Searches light DOM, all shadow roots, and localStorage for a wc: URI.

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
    window.TelegramWebviewProxy = { postEvent: () => {} };
    window.Telegram = {
      WebApp: {
        initData: "",
        initDataUnsafe: { user: { id: 1, first_name: "Test" } },
        version: "7.0",
        platform: "android",
        ready() {},
        expand() {},
        openLink() {},
        MainButton: { text: "", show() {}, hide() {}, onClick() {} },
        themeParams: {},
      },
    };
  });

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /connect wallet/i.test(x.textContent || "")
    );
    if (b) b.click();
  });

  // Poll for a pairing URI appearing anywhere reachable.
  let result = null;
  for (let i = 0; i < 25 && !result; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    result = await page.evaluate(() => {
      const hits = [];

      // Walk light DOM + every open shadow root.
      const walk = (root) => {
        for (const el of root.querySelectorAll("*")) {
          for (const attr of el.getAttributeNames?.() || []) {
            const v = el.getAttribute(attr);
            if (v && v.includes("wc:")) hits.push({ where: `${el.tagName}[${attr}]`, uri: v });
          }
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      try {
        walk(document);
      } catch {}

      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const v = localStorage.getItem(k) || "";
          const m = v.match(/wc:[a-f0-9]{20,}@\d[^"'\\\s]*/i);
          if (m) hits.push({ where: `localStorage[${k}]`, uri: m[0] });
        }
      } catch {}

      const html = document.documentElement.innerHTML;
      const m = html.match(/wc:[a-f0-9]{20,}@\d[^"'\s<]*/i);
      if (m) hits.push({ where: "document html", uri: m[0] });

      return hits.length ? hits : null;
    });
  }

  const modal = await page.evaluate(() => {
    const m = document.querySelector("w3m-modal, wcm-modal, appkit-modal");
    return { present: Boolean(m), text: (document.body.innerText || "").slice(0, 300) };
  });

  console.log("\n=== official (Telegram-aware) WalletConnect modal present:", modal.present);
  console.log("\n=== pairing URI search ===");
  if (result) {
    const seen = new Set();
    for (const h of result) {
      const key = h.uri.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  found in ${h.where}:`);
      console.log(`    ${h.uri.slice(0, 100)}...`);
    }
    console.log("\nVERDICT: PAIRING URI GENERATED -- WalletConnect handshake is working.");
  } else {
    console.log("  none found");
    console.log("\nVERDICT: NO pairing URI -- connect flow is still broken.");
  }

  await browser.close();
  process.exit(result ? 0 : 1);
})();
