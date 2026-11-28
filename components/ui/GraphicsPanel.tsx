"use client";
import { gpuName } from "@/lib/deviceClass";
import { useAmbient } from "@/lib/ambientSettings";
import { knobsFor, knobsOf, TIER_LABEL, TIER_ORDER, useKnobs, useQuality, type QualityChoice } from "@/lib/quality";
import { GODRAYS_CHOICES, GODRAYS_LABEL, type GodraysChoice } from "@/lib/godrays";
import { useGraphicsNotice } from "./graphicsUi";
import HudPanel from "./HudPanel";
import HdriPicker from "./HdriPicker";
import "./graphics.css";

const CHOICES: readonly QualityChoice[] = ["auto", ...[...TIER_ORDER].reverse()];

const TEXT: Record<Exclude<QualityChoice, "auto">, { name: string; about: string; cost: string }> = {
  ultra: { name: TIER_LABEL.ultra, about: "The finest of everything: sharpest shadows and textures, the densest plants and grass, the smoothest edges.", cost: "Can be slow on laptops. Best with a strong graphics card" },
  high: { name: TIER_LABEL.high, about: "Fine textures with relief (wood grain, fabric), soft darkening in corners and under furniture, extra trim and small details, much fuller plants.", cost: "Wants a decent graphics chip" },
  medium: { name: TIER_LABEL.medium, about: "Rounded edges, simple material textures, soft reflections and fuller plants. Corners still darken a little.", cost: "Fine on most laptops" },
  low: { name: TIER_LABEL.low, about: "Flat colours, sharp edges and sparse plants, with lamps that glow but light only a few rooms for real. No glow, blur or darkened corners; the view stops drawing while nothing moves.", cost: "Easy on the computer: older machines, tablets, phones" },
  eco: { name: TIER_LABEL.eco, about: "The simplest picture: flat colours, small soft shadows, a few plain trees, no moving leaves, clouds or dust, and the view only redraws when something changes.", cost: "For a small wall display or a Raspberry Pi: it stays cool and quiet" },
};

const RAYS_ABOUT: Record<GodraysChoice, string> = {
  auto: "Follows the quality: Soft at Detailed, Rich at Ultra, off below. Off on a computer that draws in software.",
  off: "No visible sunbeams.",
  soft: "Sunbeams in the air where light comes through windows, doors and low walls, drawn at lower detail.",
  rich: "The same beams with finer, fuller detail. Costs the most.",
};

/** Graphics setting: Automatic or one of the five tiers. A tier picked here is the owner's own choice and the automatic governor never changes it. */
export default function GraphicsPanel({ onClose }: { onClose: () => void }) {
  const tier = useQuality((s) => s.tier);
  const manual = useQuality((s) => s.manual);
  const device = useQuality((s) => s.device);
  const choose = useQuality((s) => s.choose);
  const rays = useQuality((s) => s.godrays);
  const setRays = useQuality((s) => s.setGodrays);
  const smoke = useAmbient((s) => s.smoke);
  const setSmoke = useAmbient((s) => s.setSmoke);
  const smokeAvailable = knobsOf(tier).ambient; // moving life (plants, dust, smoke) is drawn from Balanced up
  const now = useKnobs().godrays;
  const raysAvailable = knobsOf(tier).fx === "film"; // the beams are drawn in the film post stack: Balanced and up
  const raysAuto = knobsFor({ tier, device, godrays: "auto" }).godrays;
  const current: QualityChoice = manual ? tier : "auto";

  const pick = (c: QualityChoice) => {
    useGraphicsNotice.getState().clear();
    choose(c);
  };

  return (
    <HudPanel title="Graphics" meta={`Now: ${TIER_LABEL[tier]}${manual ? "" : " (automatic)"}`} onClose={onClose} className="drawer gp">
      <p className="hint">How much detail the 3D view draws. More detail looks closer to real life but asks more of your computer. Changes apply at once and are saved on this device.</p>
      <p className="hint gp-device">
        <strong>Chosen for this device: {TIER_LABEL[device.tier]}.</strong> {device.reasons.join(" ")}
      </p>
      <p className={device.software ? "hint gp-gpu warn" : "hint gp-gpu"} role={device.software ? "alert" : undefined}>
        {device.renderer ? <>Graphics chip: <strong>{gpuName(device.renderer)}</strong>.</> : "The browser does not say which graphics chip it uses."}
        {device.software && " Software rendering: turn on GPU acceleration. The processor is drawing the 3D view, which is far slower than the graphics chip. In Chromium open chrome://gpu: WebGL should say hardware accelerated (see docs/small-screens.md)."}
      </p>
      <fieldset className="gp-list">
        <legend className="gp-legend">Quality</legend>
        {CHOICES.map((c) => (
          <label key={c} className="gp-opt">
            <input type="radio" name="graphics-quality" checked={current === c} onChange={() => pick(c)} />
            <span className="gp-box">
              {c === "auto" ? (
                <>
                  <span className="gp-name">Automatic<small>now {TIER_LABEL[tier]}</small></span>
                  <span className="gp-about">Starts at {TIER_LABEL[device.tier]}, the choice for this device, and eases off by itself if the picture stutters. It only ever lowers the detail, never raises it behind your back.</span>
                  <span className="gp-cost">Recommended if you are not sure</span>
                </>
              ) : (
                <>
                  <span className="gp-name">{TEXT[c].name}</span>
                  <span className="gp-about">{TEXT[c].about}</span>
                  <span className="gp-cost">{TEXT[c].cost}</span>
                </>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="gp-list gp-row" disabled={!raysAvailable}>
        <legend className="gp-legend gp-legend-vis">God rays<small>{raysAvailable ? `now ${GODRAYS_LABEL[now]}` : `needs ${TIER_LABEL.medium} or higher`}</small></legend>
        {GODRAYS_CHOICES.map((c) => (
          <label key={c} className="gp-opt">
            <input type="radio" name="graphics-godrays" checked={rays === c} onChange={() => setRays(c)} aria-describedby="gp-rays-about" />
            <span className="gp-box">
              <span className="gp-name">{GODRAYS_LABEL[c]}{c === "auto" && <small>{GODRAYS_LABEL[raysAuto]}</small>}</span>
            </span>
          </label>
        ))}
        <p id="gp-rays-about" className="hint gp-rays-about">{RAYS_ABOUT[rays]}</p>
      </fieldset>
      <fieldset className="gp-list gp-row" disabled={!smokeAvailable}>
        <legend className="gp-legend gp-legend-vis">Smoke and flames from stoves and chimneys<small>{smokeAvailable ? (smoke ? "now on" : "now off") : `needs ${TIER_LABEL.medium} or higher`}</small></legend>
        {([true, false] as const).map((on) => (
          <label key={String(on)} className="gp-opt">
            <input type="radio" name="graphics-smoke" checked={smoke === on} onChange={() => setSmoke(on)} />
            <span className="gp-box">
              <span className="gp-name">{on ? "On" : "Off"}</span>
            </span>
          </label>
        ))}
        <p className="hint gp-rays-about">A stove, fireplace or fire pit linked to a switch shows rising smoke and a flickering glow while it burns.</p>
      </fieldset>
      <HdriPicker />
      <p className="hint">The picture may pause for a moment while it rebuilds. If it ever feels slow, pick a lighter choice. Your own choice is never changed by the app.</p>
    </HudPanel>
  );
}
