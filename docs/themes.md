# HUD themes

**Display > Appearance** (or the command palette: `Theme: Daylight`, `Status colours: Red-green safe`) switches the whole HUD. Everything applies at once and is saved on **this screen only** (`localStorage` key `doshy-theme`), so a Raspberry Pi wall display can stay dark while a phone is light.

| theme | look |
|---|---|
| **Neon** (default) | The original dark cyan. Pixel for pixel what Doshy always looked like. |
| **Blueprint** | Deep blue paper, white lines, blue Studio floor. |
| **Daylight** | Light and warm: warm white panels, dark text, blue accent, light Studio floor and backdrop. |
| **Amber** | Dark warm terminal. |
| **Graphite** | Neutral dark, almost no colour. |
| **High contrast** | Black, white and yellow, thick borders and focus rings, text above 7:1. |
| **Auto** | Follows the system: `prefers-contrast: more` gives High contrast, a light system gives Daylight, otherwise Neon. It changes live when the system changes. |

**Status colours** (independent of the theme): *Standard* (green, amber, red), *Red-green safe* (blue, yellow, pink; protanopia and deuteranopia) and *Blue-yellow safe* (green, pale yellow, red; tritanopia). Good, warning and problem are also shown by shape (circle, triangle, square) in the picker; the rest of the HUD already pairs status colour with text or an icon. The heat-map palettes are data colours; the default ("Colour-blind safe", viridis) already is.

**Accent colour**: six presets and a hue slider. The shade is chosen per theme so the accent is readable as text on every surface (4.5:1) and its button text too; where a theme draws its strong borders in the accent, the border opacity is raised so they keep 3:1. If no shade could be made readable the picker says so in plain words and keeps the theme's own accent. High contrast keeps its own colours (the picker is hidden there).

## How it works

- `app/theme-tokens.css` holds every colour as a CSS variable. A theme is one block (`[data-theme="daylight"] { ... }`) that **must define every token** (nothing is inherited from Neon). The blocks match any element, so the picker tiles preview each theme by carrying their own `data-theme`.
- `app/theme-legacy.css`: about fifty one-off tints (`--lg-*`) that predate the tokens. Neon keeps their exact old values; every other theme maps each onto a semantic token. New CSS must not add to it.
- `app/theme-light.css`: the few rules a light theme needs because the HUD was drawn for a dark scene (a halo behind text that floats on the 3D view).
- **No flash**: an inline script in `<head>` (`THEME_BOOT_SCRIPT` in `lib/theme.ts`, tested against fake browsers) writes `data-theme`, `data-scheme` (`light`/`dark`), `data-status` and the cached accent on `<html>` before first paint. `components/ThemeClass.tsx` keeps them in step afterwards (and with other tabs and the system). Changing theme is attributes and variables only: no per-element JS, no extra frame cost on Eco.
- Code that cannot use CSS variables (3D, canvases): `useThemeColors()` (`lib/useThemeColors.ts`) returns the colours as strings, read from the computed variables once per theme change. It drives the Studio clear colour, the Studio floor uniforms (recoloured in place, no shader recompile), the footprint halo strength and the Piece builder canvas. The garden's day/night sky logic is untouched.
- The guest page (`/view/<token>`) uses the same root layout, so it follows the visitor's own device choice.

## Tokens

Use these in CSS; never write a colour literal. Full usage notes sit at the top of `app/theme-tokens.css`.

| group | tokens |
|---|---|
| surfaces | `--bg --bg-elev --panel-2 --sunken --panel-solid --void`; translucent `rgb(var(--panel-rgb) / a)`, `--panel` (94 %), `--glass` (55 %); `--panel-k` makes see-through panels more opaque on light themes (write `calc(.6 * var(--panel-k))` for other alphas) |
| lines | `--border --border-strong`, `rgb(var(--line-rgb) / a)` |
| text | `--text --text-2 --text-3 --text-dim --text-faint`, `rgb(var(--text-rgb) / a)`, `rgb(var(--dim-rgb) / a)`; `--hi` strongest (white on dark, near-black on light) |
| accent | `--accent --accent-hi --accent-soft --accent-ink`, `rgb(var(--accent-rgb) / a)` |
| status | `--ok --warn --bad --info` (fills, icons, strokes), `--ok-text --warn-text --bad-text --info-text` (text), `--on-warn --on-bad --on-solid` (text on those fills), `rgb(var(--bad-rgb) / a)` etc. |
| overlays | `--scrim`, `--shade-20 ... --shade-90` (recess and shadow shades, subtle on light), `rgb(var(--fg-rgb) / a)` |
| focus | `--focus --focus-w` |
| plan sheet | `--plan-paper --plan-line --plan-rule` |
| scene | `--scene-backdrop --studio-centre --studio-mid --studio-line --halo-a` |
| old names | `--muted --accent-line --err --err-text --bg-2` stay as aliases |

Stays literal on purpose: 3D materials, lamp and weather colours, plan photos, colours you choose for rooms and paint, heat-map palettes, car paint, the wall display and screensaver (dark by design, for a dark room and night), the plan-list thumbnails (`lib/planThumb.ts`).

## Add a theme

1. Add the id to `THEME_IDS` (and `LIGHT_THEMES` if light) and its label and note in `lib/theme.ts`.
2. Copy a block in `app/theme-tokens.css`, set every token.
3. `npm test`: `lib/themeContrast.test.ts` checks each theme (and each status palette on it): text 4.5:1 on every surface (page, raised, sunken, translucent panel and glass), placeholders 3:1, status fills, focus and the strong border 3:1, text on accent/warn/bad fills 4.5:1, plan sheet lines, every accent preset, and that the colour-blind palettes stay distinguishable under simulated colour blindness (Machado 2009, CIE76 difference at least 30).

## Verified, and limits

Verified in a headless Chromium at 1600x900 and 800x480: every theme on Live, the Data/Scenes/Plans panels, command palette, Plan view, Furniture, Display, the compact menu; Neon unchanged (computed colours of about 10 000 element properties compared before and after the conversion; remaining differences were moved DOM indexes and live data); reload persistence; Auto light/dark and `prefers-contrast: more`, also live; first paint already themed (the theme is on `<html>` before `<body>` exists); keyboard focus ring width and colour per theme; guest page themed.

Limits: the iOS "Add to Home screen" status bar style is fixed by the manifest (`black-translucent`), so a light theme has light text there; the Plan list thumbnails and the wall display stay dark; text drawn straight on the 3D view in light themes relies on a halo, not a panel; the 3D building and its lighting are not themed (Daylight changes the Studio backdrop and floor, not the sky).
