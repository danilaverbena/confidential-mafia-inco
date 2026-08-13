import { renderOg, OG_SIZE, OG_ALT } from "@/lib/og-render";

export const size = OG_SIZE;
export const alt = OG_ALT;
export const contentType = "image/png";

export default function Image() {
  return renderOg();
}
