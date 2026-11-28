import { PAPER } from "./BlueprintPaper";

// Colours and type of the plan editor's drawn overlays (selection, handles, labels).
export const ACCENT = "var(--accent)";
export const WARN = "var(--lg-ff7a45)";
export const CYAN_LINE = "rgb(var(--accent-rgb) / 0.55)";
export const INK = PAPER; // masks and label outlines use the sheet colour
export const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "0.08em" } as const;
export const HALO = { paintOrder: "stroke", stroke: INK, strokeWidth: 0.09, strokeLinejoin: "round" } as const;
