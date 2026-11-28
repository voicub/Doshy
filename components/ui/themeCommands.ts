"use client";
import { STATUS_LABEL, STATUS_PALETTES, THEME_CHOICES, THEME_LABEL } from "@/lib/theme";
import { useTheme } from "@/lib/themeStore";
import type { Cmd } from "./paletteCommands";

/** "Theme: Daylight", "Status colours: Red-green safe", ...: the same choices as Display settings, one keystroke away. Reads the stored choice when the palette builds its list (the palette closes on run). */
export function themeCommands(): Cmd[] {
  const { settings } = useTheme.getState();
  const cmd = (id: string, label: string, current: boolean, run: () => void): Cmd => ({ id: `act:${id}`, group: "Actions", label, hay: `${label} theme appearance colours`, meta: current ? "Current" : undefined, run });
  return [
    ...THEME_CHOICES.map((c) => cmd(`theme:${c}`, `Theme: ${THEME_LABEL[c]}`, settings.theme === c, () => useTheme.getState().set({ theme: c }))),
    ...STATUS_PALETTES.map((p) => cmd(`status:${p}`, `Status colours: ${STATUS_LABEL[p]}`, settings.status === p, () => useTheme.getState().set({ status: p }))),
  ];
}
