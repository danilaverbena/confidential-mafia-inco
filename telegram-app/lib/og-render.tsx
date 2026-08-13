import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Shared social-card image, used by both opengraph-image and twitter-image.
// Rendered on the fly by next/og in the same terminal theme as the app.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Confidential Deck - confidential card games on Inco";

// The Inco mark (blue square + three bars), inlined so it needs no asset.
const MARK =
  '<svg width="248" height="248" viewBox="0 0 248 248" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M24 56C24 38.3269 38.2886 24 55.9145 24H191.551C209.177 24 223.466 38.3269 223.466 56V192C223.466 209.673 209.177 224 191.551 224H55.9145C38.2886 224 24 209.673 24 192V56Z" fill="#3673F5"/>' +
  '<path d="M61.8986 162L82.0047 86H103.786L83.6802 162H61.8986Z" fill="white"/>' +
  '<path d="M103.786 162L123.893 86H145.674L125.568 162H103.786Z" fill="white"/>' +
  '<path d="M145.674 162L165.78 86H187.562L167.456 162H145.674Z" fill="white"/></svg>';

export async function renderOg() {
  const font = await readFile(join(process.cwd(), "app/fonts/DepartureMono-Regular.woff"));
  const mark = `data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#020B20",
          color: "#e6ebff",
          fontFamily: "DepartureMono",
          padding: 96,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 44 }}>
          <img src={mark} width={48} height={48} alt="" />
          <span style={{ fontSize: 22, letterSpacing: 6, color: "#6f8bd6", textTransform: "uppercase" }}>inco</span>
        </div>
        <div style={{ display: "flex", fontSize: 88, letterSpacing: 1, color: "#3673F5" }}>confidential deck</div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 28, color: "#8ea3cc" }}>confidential card games on inco</div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "DepartureMono", data: font, style: "normal", weight: 400 }] }
  );
}
