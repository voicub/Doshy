// The visual editor of doshy-card (the card's getConfigElement loads this file only when someone edits the card). Built on Home Assistant's own form (ha-form).

const LABELS = {
  title: "Title (optional)",
  url: "Doshy address (empty: the one the integration uses)",
  plan: "Plan number (empty: the home plan)",
  view: "View",
  height: "Height (pixels such as 400, or a ratio such as 16/9)",
  theme: "Theme",
  kiosk: "Show only the 3D scene (no menus)",
  interactive: "Taps switch devices (the page no longer scrolls by touch over the card)",
};

const SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "url", selector: { text: { type: "url" } } },
  { name: "plan", selector: { text: {} } },
  {
    name: "view",
    selector: {
      select: {
        mode: "dropdown",
        custom_value: true, // for room:<name>
        options: [
          { value: "3d", label: "Whole home in 3D" },
          { value: "overview", label: "Overview" },
        ],
      },
    },
  },
  { name: "height", selector: { text: {} } },
  {
    name: "theme",
    selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Follow Home Assistant" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }] } },
  },
  { name: "kiosk", selector: { boolean: {} } },
  { name: "interactive", selector: { boolean: {} } },
];

const DEFAULTS = { kiosk: true, interactive: false, view: "3d", theme: "auto" };

/** The settings without the fields left empty or equal to the default: the YAML stays short. */
function tidy(value) {
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    const empty = v === undefined || v === null || v === "";
    if (!empty && v !== DEFAULTS[key]) out[key] = v;
  }
  return out;
}

class DoshyCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this._config) return;
    if (!customElements.get("ha-form")) {
      this.textContent = "The visual editor is not available here. Edit the card in YAML instead.";
      return;
    }
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = SCHEMA;
      this._form.computeLabel = (field) => LABELS[field.name] ?? field.name;
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const { type } = this._config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { type, ...tidy(ev.detail.value) } }, bubbles: true, composed: true }));
      });
      this.replaceChildren(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { ...DEFAULTS, ...this._config };
  }
}

if (!customElements.get("doshy-card-editor")) customElements.define("doshy-card-editor", DoshyCardEditor);
