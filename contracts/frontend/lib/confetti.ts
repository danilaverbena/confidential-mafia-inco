// Small win burst in the terminal palette. Dynamically imported so it never
// runs on the server and adds nothing to the initial bundle.
export async function celebrate() {
  if (typeof window === "undefined") return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#3673F5", "#ffffff", "#1e3a8a"];
  confetti({ particleCount: 70, spread: 62, startVelocity: 45, origin: { y: 0.35 }, colors, disableForReducedMotion: true });
  confetti({ particleCount: 40, spread: 100, decay: 0.92, scalar: 0.8, origin: { y: 0.4 }, colors, disableForReducedMotion: true });
}
