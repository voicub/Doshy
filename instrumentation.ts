// Runs once when the Next server starts (a change here needs a server restart). Starts the dawn rule for sun-blocking curtains
// (lib/server/curtainAutomation.ts), which keeps working with no browser open. Does nothing without Home Assistant set up or with HOUSEY_AUTOMATION=off.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Dynamic on purpose: this file is also built for the edge runtime, which has no node:sqlite; only the Node.js runtime may load it.
  const { startCurtainAutomation } = await import("@/lib/server/curtainAutomation");
  startCurtainAutomation();
}
