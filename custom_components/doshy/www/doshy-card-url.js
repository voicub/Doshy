// From the card's settings to the address of the Doshy page to show. No DOM and no Home Assistant here, so Node can test it
// (scripts/doshy-card.test.mjs). The card (doshy-card.js) and its editor import it.

const PLAN_ID = /^[A-Za-z0-9_-]+$/;
const MAX_ROOM_NAME = 80;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MIN_PX = 100;
const MAX_PX = 3000;
const MAX_RATIO_PART = 1000;
const DEFAULT_RATIO = "16 / 9";

const fail = (field, reason) => ({ ok: false, field, reason });

/**
 * The height of the card as `{ kind: "px", px }` or `{ kind: "ratio", ratio }` (a CSS `aspect-ratio` value), or null when it is not a usable height.
 * Accepts 400, "400", "400px", "16/9", "16 / 9" and "1.5/1". Nothing set means 16 / 9.
 */
export function normalizeHeight(value) {
  if (value === undefined || value === null || value === "") return { kind: "ratio", ratio: DEFAULT_RATIO };
  const px = (n) => (Number.isFinite(n) && n >= MIN_PX && n <= MAX_PX ? { kind: "px", px: Math.round(n) } : null);
  if (typeof value === "number") return px(value);
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  const pixels = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(text);
  if (pixels) return px(Number(pixels[1]));
  const ratio = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (!ratio) return null;
  const [w, h] = [Number(ratio[1]), Number(ratio[2])];
  return w > 0 && h > 0 && w <= MAX_RATIO_PART && h <= MAX_RATIO_PART ? { kind: "ratio", ratio: `${w} / ${h}` } : null;
}

/** The view the card asks for: null for the whole 3D plan (`3d`, `overview`, nothing set), `{ room }` for one room, or undefined when the text is not a view. */
function parseView(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text === "3d" || text === "overview") return null;
  if (!/^room:/i.test(text)) return undefined;
  const room = text.slice(5).trim();
  return room && room.length <= MAX_ROOM_NAME && !CONTROL_CHARS.test(room) ? { room } : undefined;
}

/** Loopback addresses count as safe for a page over https: browsers do not block them as mixed content. */
function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

/** True when a page opened over https would have its Doshy frame blocked by the browser (a plain http address that is not this very computer). */
export function mixedContent(pageProtocol, url) {
  if (pageProtocol !== "https:") return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" && !isLoopback(u.hostname);
  } catch {
    return false;
  }
}

function parseAddress(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    // a login inside the address would be handed to every browser that opens the dashboard
    return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

/**
 * The address for the iframe, or the reason there is none.
 * `config`: the card's YAML (`url`, `plan`, `view`, `kiosk`, `interactive`, `theme`, `height`; see docs/lovelace-card.md).
 * `defaultUrl`: the address the integration is set up with. `dark`: whether Home Assistant is in a dark theme (undefined: unknown).
 * `pageProtocol`: `location.protocol` of the page the card is on.
 * Returns `{ ok: true, url, mixed }` or `{ ok: false, field, reason }` (reason in plain English, for the card to show).
 */
export function buildEmbedUrl(config, { defaultUrl, dark, pageProtocol } = {}) {
  const c = config && typeof config === "object" ? config : {};
  const rawUrl = c.url === undefined || c.url === "" ? defaultUrl : c.url;
  if (rawUrl === undefined || rawUrl === null || rawUrl === "") return fail("url", "No Doshy address yet. Set up the Doshy integration, or give the card a url.");
  const address = parseAddress(rawUrl);
  if (!address) return fail("url", "The Doshy address must start with http:// or https:// and must not contain a user name or password.");

  const plan = c.plan === undefined || c.plan === null || c.plan === "" ? null : String(c.plan);
  if (plan !== null && !PLAN_ID.test(plan)) return fail("plan", "The plan is the number in the plan's link (?plan=2). Use letters, digits, - and _ only.");

  const view = parseView(c.view);
  if (view === undefined) return fail("view", "The view must be 3d, overview or room:<room name>.");

  if (normalizeHeight(c.height) === null) return fail("height", `The height must be ${MIN_PX} to ${MAX_PX} pixels (400) or a ratio (16/9).`);

  const theme = c.theme === undefined || c.theme === "auto" ? null : c.theme;
  if (theme !== null && theme !== "dark" && theme !== "light") return fail("theme", "The theme must be auto, dark or light.");

  const embed = c.kiosk !== false; // no chrome is the point of the card
  if (embed) {
    address.searchParams.set("embed", "1");
    if (c.interactive === true) address.searchParams.set("interactive", "1");
    if (view?.room) address.searchParams.set("view", `room:${view.room}`);
    else if (typeof c.view === "string" && c.view.trim() === "overview") address.searchParams.set("view", "overview");
  }
  if (plan !== null) address.searchParams.set("plan", plan);
  const wanted = theme ?? (dark === undefined ? null : dark ? "dark" : "light");
  if (wanted !== null) address.searchParams.set("theme", wanted);
  address.hash = "";
  const url = address.toString();
  return { ok: true, url, mixed: mixedContent(pageProtocol, url) };
}
