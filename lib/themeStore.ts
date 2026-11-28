// This device's theme choice (Display settings, command palette) as React state. components/ThemeClass.tsx applies it to <html> and keeps it in localStorage (lib/themeApply.ts).
// The choice belongs to the screen, not to the plan or the account: the wall display can stay dark while a phone is light.
import { create } from "zustand";
import { cleanTheme, THEME_DEFAULTS, THEME_STORAGE_KEY, type ThemeId, type ThemeSettings } from "./theme";

/** The settings stored on this device; the defaults when nothing usable is stored (or the browser blocks storage). */
export function loadTheme(): ThemeSettings {
  try {
    return cleanTheme(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? "null"));
  } catch {
    return THEME_DEFAULTS;
  }
}

type ThemeState = {
  settings: ThemeSettings;
  /** The theme in force now (Auto resolved), and why an accent colour was refused (null when fine). Written by ThemeClass. */
  theme: ThemeId;
  accentError: string | null;
  set: (patch: Partial<ThemeSettings>) => void;
  reset: () => void;
  applied: (theme: ThemeId, accentError: string | null) => void;
};

export const useTheme = create<ThemeState>((set) => ({
  settings: typeof localStorage === "undefined" ? THEME_DEFAULTS : loadTheme(),
  theme: "neon",
  accentError: null,
  set: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  reset: () => set({ settings: THEME_DEFAULTS }),
  applied: (theme, accentError) => set({ theme, accentError }),
}));
