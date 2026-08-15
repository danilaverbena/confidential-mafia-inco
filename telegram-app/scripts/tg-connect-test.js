// Headless reproduction of "tap connect wallet inside Telegram, nothing happens".
//
// Loads the app in Chrome with window.Telegram.WebApp / TelegramWebviewProxy
// injected before any page script runs (so every Telegram feature-detect in
// wagmi/RainbowKit/Reown sees what it would see in a real Mini App), clicks the
// connect button, and reports what actually happened: which WalletConnect
// project id went out on the wire, whether a wc: pairing URI was produced, what
// the page tried to open/navigate to, and any console or page errors that were
// otherwise swallowed by the UI.
//
// Usage: node tg-connect-test.js <url>

const puppeteer = require("puppeteer");

const URL = process.argv[2] || "https://confidential-mafia-inco.vercel.app/confidential-mafia";

(async () => {
  const browser = await puppeteer.launch({
    headless: true, executablePath: "/snap/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  // A real Telegram Android webview UA, so any UA sniffing behaves the same.
  await page.setUserAgent(
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
  );
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });

  const events = [];

  // Inject the Telegram Mini App surface + instrument the exact APIs that the
  // various wallet SDKs use to hand off to a wallet app, so we can see which
  // one gets called and with what.
  await page.evaluateOnNewDocument(() => {
    window.__events = [];
    const log = (type, detail) => window.__events.push({ type, detail });

    window.TelegramWebviewProxy = {
      postEvent: (e, d) => log("TelegramWebviewProxy.postEvent", `${e} ${d}`),
    };
    window.Telegram = {
      WebApp: {
        initData: "",
        initDataUnsafe: { user: { id: 1, first_name: "Test" } },
        version: "7.0",
        platform: "android",
        ready() {},
        expand() {},
        openLink: (url) => log("Telegram.WebApp.openLink", url),
        MainButton: { text: "", show() {}, hide() {}, onClick() {} },
        themeParams: {},
      },
    };

    const origOpen = window.open;
    window.open = function (url, target, features) {
      log("window.open", `${url} | target=${target}`);
      return origOpen.call(window, url, target, features);
    };

    // location.href assignment is how @metamask/sdk deep-links; can't truly
    // intercept the setter on a real Location, but we can at least catch
    // navigations away via beforeunload.
    window.addEventListener("beforeunload", () => log("beforeunload", location.href));
  });

  page.on("console", (m) => events.push({ type: `console.${m.type()}`, detail: m.text().slice(0, 300) }));
  page.on("pageerror", (e) => events.push({ type: "pageerror", detail: String(e).slice(0, 300) }));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/walletconnect|reown|relay/i.test(u)) {
      events.push({ type: "requestfailed", detail: `${u.slice(0, 160)} :: ${r.failure()?.errorText}` });
    }
  });
  page.on("request", (r) => {
    const u = r.url();
    if (/walletconnect|reown/i.test(u)) {
      const m = u.match(/projectId=([a-f0-9]+)/i);
      events.push({ type: "wc-request", detail: (m ? `projectId=${m[1]} ` : "") + u.slice(0, 130) });
    }
  });

  console.log(`\n=== loading ${URL} ===`);
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));

  // Sanity: did the app see Telegram, and which connectors got registered?
  const detected = await page.evaluate(() => ({
    hasTelegram: Boolean(window.Telegram && window.Telegram.WebApp),
    bodyText: document.body.innerText.slice(0, 400),
  }));
  console.log("\n--- telegram detected by page:", detected.hasTelegram);
  console.log("--- visible text:\n" + detected.bodyText);

  // Find and click the connect button.
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => /connect wallet/i.test(x.textContent || ""));
    if (!b) return { ok: false, buttons: btns.map((x) => x.textContent?.trim()).slice(0, 20) };
    b.click();
    return { ok: true };
  });
  console.log("\n--- clicked connect:", JSON.stringify(clicked));

  // Give the relay round-trip time to produce a pairing URI.
  await new Promise((r) => setTimeout(r, 12000));

  const injected = await page.evaluate(() => window.__events || []);
  const after = await page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 600),
    // Reown's modal is a custom element; RainbowKit's is a plain div.
    reownModal: Boolean(document.querySelector("w3m-modal, wcm-modal, appkit-modal")),
    rkModal: Boolean(document.querySelector("[data-rk]")),
  }));

  console.log("\n=== page-injected events (window.open / openLink / navigation) ===");
  injected.forEach((e) => console.log(`  [${e.type}] ${e.detail}`));

  console.log("\n=== console / network events ===");
  events.slice(0, 60).forEach((e) => console.log(`  [${e.type}] ${e.detail}`));

  console.log("\n=== after click ===");
  console.log("  reown/walletconnect modal present:", after.reownModal);
  console.log("  rainbowkit modal present:", after.rkModal);
  console.log("  visible text:\n" + after.bodyText);

  const wcUri = injected.find((e) => /wc:/.test(e.detail || ""));
  console.log("\n=== VERDICT ===");
  console.log("  pairing URI handed off:", wcUri ? "YES -> " + wcUri.detail.slice(0, 120) : "NO");

  await browser.close();
})();
