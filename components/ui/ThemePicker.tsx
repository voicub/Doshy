"use client";
import { useMemo } from "react";
import { ACCENT_PRESETS, deriveAccent, schemeOf, STATUS_LABEL, STATUS_NOTE, STATUS_PALETTES, surfacesFrom, THEME_CHOICES, THEME_LABEL, THEME_NOTE, type StatusPalette, type ThemeChoice, type ThemeId } from "@/lib/theme";
import { useTheme } from "@/lib/themeStore";
import "./ThemePicker.css";

/** A small drawing of the HUD in a theme's own colours: it carries `data-theme`, so the colour tokens inside it are that theme's whatever the page is using (app/theme-tokens.css). */
function Mock({ theme }: { theme: ThemeId }) {
  return (
    <span className="tp-mock" data-theme={theme} data-scheme={schemeOf(theme)} aria-hidden="true">
      <span className="tp-bar" />
      <span className="tp-card"><b /><b /><b /></span>
      <span className="tp-btn" />
      <span className="tp-dots"><i /><i /><i /></span>
    </span>
  );
}

function Tile({ choice, active, onPick }: { choice: ThemeChoice; active: boolean; onPick: () => void }) {
  return (
    <button type="button" className="tp-tile" aria-pressed={active} onClick={onPick}>
      {choice === "auto" ? (
        <span className="tp-pair" aria-hidden="true"><Mock theme="daylight" /><Mock theme="neon" /></span>
      ) : (
        <Mock theme={choice} />
      )}
      <span className="tp-name">{THEME_LABEL[choice]}</span>
      <span className="tp-note">{THEME_NOTE[choice]}</span>
    </button>
  );
}

/** The three status colours with a shape each (circle, triangle, square), so they never rely on colour alone. */
function StatusSwatch({ palette, theme }: { palette: StatusPalette; theme: ThemeId }) {
  return (
    <span className="tp-sw" data-theme={theme} data-scheme={schemeOf(theme)} data-status={palette === "standard" ? undefined : palette} aria-hidden="true">
      <i className="ok" /><i className="warn" /><i className="bad" />
    </span>
  );
}

/** Display settings > Appearance: theme tiles, status colours, accent colour. Every choice applies at once (components/ThemeClass.tsx) and is kept on this device only. */
export default function ThemePicker() {
  const { settings, theme, accentError, set, reset } = useTheme();
  const scheme = schemeOf(theme);

  // The accent each preset would get on the theme in force; measured from the page's own colours, once per theme change.
  const presets = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const surfaces = surfacesFrom((n) => cs.getPropertyValue(n));
    return ACCENT_PRESETS.map((p) => ({ ...p, result: surfaces ? deriveAccent(p.hue, scheme, surfaces) : null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` is what changes the page's surfaces; `scheme` follows it
  }, [theme, scheme]);
  const locked = theme === "contrast";

  return (
    <>
      <section className="disp-sec">
        <h3 className="label disp-h">Theme</h3>
        <div className="tp-grid" role="group" aria-label="Theme">
          {THEME_CHOICES.map((c) => <Tile key={c} choice={c} active={settings.theme === c} onPick={() => set({ theme: c })} />)}
        </div>
        <p className="hint">{settings.theme === "auto" ? `Following your system: showing ${THEME_LABEL[theme]} right now.` : "Saved on this screen only, so a wall display can stay dark while your phone is light."}</p>
      </section>

      <section className="disp-sec">
        <h3 className="label disp-h">Status colours</h3>
        <div className="tp-status" role="group" aria-label="Status colours">
          {STATUS_PALETTES.map((p) => (
            <button key={p} type="button" className="tp-opt" aria-pressed={settings.status === p} onClick={() => set({ status: p })}>
              <StatusSwatch palette={p} theme={theme} />
              <span>{STATUS_LABEL[p]}</span>
            </button>
          ))}
        </div>
        <p className="hint">{STATUS_NOTE[settings.status]} Good, warning and problem also differ by shape.</p>
      </section>

      <section className="disp-sec">
        <h3 className="label disp-h">Accent colour</h3>
        {locked ? (
          <p className="hint">High contrast keeps its own colours so it stays easy to read.</p>
        ) : (
          <>
            <div className="tp-accents" role="group" aria-label="Accent colour">
              <button type="button" className="tp-opt tp-own" aria-pressed={settings.accent === null} onClick={() => set({ accent: null })}>Theme colour</button>
              {presets.map((p) => (
                <button key={p.label} type="button" className="tp-dot" aria-label={p.label} title={p.result && !p.result.ok ? p.result.message : p.label} aria-pressed={settings.accent === p.hue} disabled={p.result !== null && !p.result.ok}
                  style={p.result?.ok ? { background: p.result.hex } : undefined} onClick={() => set({ accent: p.hue })} />
              ))}
            </div>
            <label className="tp-hue">
              <span>Any colour</span>
              <input type="range" min={0} max={359} step={1} value={settings.accent ?? 195} aria-label="Pick any colour" onChange={(e) => set({ accent: Number(e.target.value) })} />
            </label>
            <p className={`hint${accentError ? " tp-err" : ""}`} role={accentError ? "alert" : undefined}>{accentError ?? "Buttons, highlights and the glow around panels. The shade is adjusted so text stays easy to read."}</p>
          </>
        )}
        <button type="button" className="btn" onClick={reset}>Reset appearance</button>
      </section>
    </>
  );
}
