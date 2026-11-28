// doshy-card: the Doshy 3D home as a Lovelace card. Plain JavaScript, no build step. The Doshy integration serves this file and
// adds it to every dashboard, so a card only needs `type: custom:doshy-card` (docs/lovelace-card.md).
import { buildEmbedUrl, normalizeHeight } from "./doshy-card-url.js";

const DOCS_URL = "https://github.com/voicub/Doshy/blob/main/docs/lovelace-card.md";
const DOSHY_SILENT_MS = 15000; // no load event after this long: say so instead of showing an empty box
const MASONRY_ROW_PX = 50; // Home Assistant's masonry view counts card sizes in rows of about 50 px
const FALLBACK_CARD_SIZE = 6;

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; position: relative; }
  .frame { position: relative; background: var(--ha-card-background, var(--card-background-color, #111)); }
  iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; opacity: 0; transition: opacity 0.3s; }
  .ready iframe { opacity: 1; }
  .ready .skeleton { display: none; }
  .view-only iframe { pointer-events: none; } /* the page behind the card keeps scrolling by touch; taps are for the dashboard */
  .skeleton { position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, var(--divider-color, rgba(127,127,127,.25)) 50%, transparent 70%) 0 0 / 200% 100%; opacity: .5; animation: sweep 1.6s linear infinite; }
  @keyframes sweep { to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } iframe { transition: none; } }
  .note { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 16px; box-sizing: border-box; overflow: auto; color: var(--primary-text-color); font-size: 14px; line-height: 1.4; }
  .note.problem { color: var(--warning-color, #b45309); }
  .note strong { display: block; color: var(--primary-text-color); }
  .note a { color: var(--primary-color); }
  .note code { word-break: break-all; }
`;

class DoshyCard extends HTMLElement {
  static getStubConfig() {
    return { view: "3d" };
  }

  static async getConfigElement() {
    await import("./doshy-card-editor.js");
    return document.createElement("doshy-card-editor");
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("The card needs settings (or just type: custom:doshy-card).");
    this._config = config;
    this._key = undefined;
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  getCardSize() {
    const h = normalizeHeight(this._config?.height);
    if (h?.kind === "px") return Math.max(1, Math.round(h.px / MASONRY_ROW_PX));
    const [w, hh] = h?.ratio.split("/").map(Number) ?? [];
    return this.offsetWidth && w && hh ? Math.max(1, Math.round((this.offsetWidth * hh) / w / MASONRY_ROW_PX)) : FALLBACK_CARD_SIZE;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 3, rows: "auto" }; // the card sets its own height (height option)
  }

  connectedCallback() {
    this._update();
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
    this._timer = undefined;
  }

  /** Work out what to show from the settings, the integration's address and the theme; touch the page only when that changed. */
  _update() {
    if (!this._config || !this._hass || !this.isConnected) return;
    if (!this._config.url && this._defaultUrl === undefined) return this._askAddress();
    const result = buildEmbedUrl(this._config, { defaultUrl: this._defaultUrl, dark: this._hass.themes?.darkMode, pageProtocol: location.protocol });
    const key = JSON.stringify([result, this._config.title, this._config.height, this._config.interactive]);
    if (key === this._key) return; // most hass updates change nothing here: never reload the 3D scene for them
    this._key = key;
    this._render(result);
  }

  /** The address Doshy was set up with in the integration (a websocket command of the integration; it holds nothing secret). */
  _askAddress() {
    if (this._asking) return;
    this._asking = true;
    this._hass.callWS({ type: "doshy/config" }).then(
      (r) => (this._defaultUrl = typeof r?.url === "string" ? r.url : null),
      () => (this._defaultUrl = null), // the integration is not installed: the card needs its own url
    ).finally(() => {
      this._asking = false;
      this._update();
    });
  }

  _render(result) {
    clearTimeout(this._timer);
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    const card = document.createElement("ha-card");
    if (this._config.title) card.setAttribute("header", String(this._config.title));
    const frame = document.createElement("div");
    frame.className = "frame";
    const h = normalizeHeight(this._config.height) ?? normalizeHeight(undefined);
    if (h.kind === "px") frame.style.height = `${h.px}px`;
    else frame.style.aspectRatio = h.ratio;
    card.append(frame);
    const style = document.createElement("style");
    style.textContent = STYLE;
    root.replaceChildren(style, card);

    if (!result.ok) return frame.append(this._note("problem", "Doshy card", result.reason));
    if (result.mixed) return frame.append(this._mixedNote(result.url));

    if (this._config.interactive !== true) frame.classList.add("view-only");
    const iframe = document.createElement("iframe");
    iframe.title = "Doshy 3D home";
    iframe.referrerPolicy = "no-referrer";
    iframe.allow = "fullscreen";
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton";
    frame.append(iframe, skeleton);
    iframe.addEventListener("load", () => {
      clearTimeout(this._timer);
      frame.classList.add("ready");
      frame.querySelector(".note")?.remove();
    });
    this._timer = setTimeout(() => {
      if (frame.classList.contains("ready") || !frame.isConnected) return;
      const origin = new URL(result.url).origin;
      frame.append(this._note("problem", `Doshy did not answer at ${origin}`, "Check that Doshy is running and that this device can reach that address."));
    }, DOSHY_SILENT_MS);
    iframe.src = result.url;
  }

  _note(kind, head, text) {
    const note = document.createElement("div");
    note.className = `note ${kind}`;
    note.setAttribute("role", kind === "problem" ? "alert" : "status");
    const strong = document.createElement("strong");
    strong.textContent = head;
    note.append(strong, text);
    return note;
  }

  _mixedNote(url) {
    const note = this._note("problem", "Doshy cannot be shown here", "");
    const origin = new URL(url).origin;
    const where = document.createElement("span");
    where.append("This dashboard is open over https, but Doshy is at ");
    const code = document.createElement("code");
    code.textContent = origin;
    where.append(code, ", which is plain http. Browsers block that. Either serve Doshy over https (for example behind the same reverse proxy as Home Assistant) and give the card that https address, or open this dashboard over http. ");
    const link = document.createElement("a");
    link.href = DOCS_URL;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "More in the card's guide";
    where.append(link, ".");
    note.append(where);
    return note;
  }
}

if (!customElements.get("doshy-card")) customElements.define("doshy-card", DoshyCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "doshy-card")) {
  window.customCards.push({
    type: "doshy-card",
    name: "Doshy",
    description: "Your Doshy 3D home as a card: the whole house or one room, view-only or tap to switch devices.",
    preview: false,
    documentationURL: DOCS_URL,
  });
}
