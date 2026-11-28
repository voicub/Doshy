// Puts a theme choice on the page: attributes on <html> (the CSS variables do the rest, no per-element work), the accent colour, the browser's address-bar colour, and the copy in localStorage
// that the boot script (lib/theme.ts) reads before the next first paint. DOM only; the decisions are in lib/theme.ts.
import { ACCENT_VAR_NAMES, accentVars, deriveAccent, resolveTheme, schemeOf, surfacesFrom, THEME_STORAGE_KEY, type StoredTheme, type ThemeId, type ThemeSettings } from "./theme";

export const systemPrefs = () => ({ prefersLight: matchMedia("(prefers-color-scheme: light)").matches, prefersMoreContrast: matchMedia("(prefers-contrast: more)").matches });

/** Applies `s` and returns the theme now in force and, when the chosen accent colour could not be made readable, a plain-English reason (the accent then stays the theme's own). */
export function applyTheme(s: ThemeSettings): { theme: ThemeId; accentError: string | null } {
  const root = document.documentElement;
  const theme = resolveTheme(s.theme, systemPrefs());
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-scheme", schemeOf(theme));
  if (s.status === "standard") root.removeAttribute("data-status");
  else root.setAttribute("data-status", s.status);

  for (const n of ACCENT_VAR_NAMES) root.style.removeProperty(n); // the theme's own accent, so the surfaces below are measured without the previous custom one
  let vars: Record<string, string> | undefined;
  let accentError: string | null = null;
  if (s.accent !== null && theme !== "contrast") { // High contrast keeps its own colours: they are what make it high contrast
    const cs = getComputedStyle(root);
    const surfaces = surfacesFrom((n) => cs.getPropertyValue(n));
    const r = surfaces ? deriveAccent(s.accent, schemeOf(theme), surfaces) : null;
    if (r?.ok) {
      vars = accentVars(r);
      for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    } else accentError = r ? r.message : null;
  }

  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg); // the phone's status bar and the installed app's frame follow the theme
  const stored: StoredTheme = { ...s, resolved: vars ? { theme, vars } : undefined };
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // storage blocked (private mode): the choice lasts until the page is closed
  }
  return { theme, accentError };
}
