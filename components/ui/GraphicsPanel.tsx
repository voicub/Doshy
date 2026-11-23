"use client";
import { TIER_LABEL, TIER_ORDER, useQuality, type QualityChoice } from "@/lib/quality";
import { useGraphicsNotice } from "./graphicsUi";
import HudPanel from "./HudPanel";
import "./graphics.css";

const CHOICES: readonly QualityChoice[] = ["auto", ...[...TIER_ORDER].reverse()];

const TEXT: Record<Exclude<QualityChoice, "auto">, { name: string; about: string; cost: string }> = {
  ultra: { name: TIER_LABEL.ultra, about: "The finest of everything: sharpest shadows and textures, the densest plants and grass, the smoothest edges.", cost: "Can be slow on laptops. Best with a strong graphics card" },
  high: { name: TIER_LABEL.high, about: "Fine textures with relief (wood grain, fabric), soft darkening in corners and under furniture, extra trim and small details, much fuller plants.", cost: "Wants a decent graphics chip" },
  medium: { name: TIER_LABEL.medium, about: "Rounded edges, simple material textures, soft reflections and fuller plants. Corners still darken a little.", cost: "Fine on most laptops" },
  low: { name: TIER_LABEL.low, about: "Flat colours, sharp edges and sparse plants, with lamps that glow but light only a few rooms for real. No glow, blur or darkened corners; the view stops drawing while nothing moves.", cost: "Easy on the computer: older machines, tablets, phones" },
  eco: { name: TIER_LABEL.eco, about: "The simplest picture: flat colours, small soft shadows, a few plain trees, no moving leaves, clouds or dust, and the view only redraws when something changes.", cost: "For a small wall display or a Raspberry Pi: it stays cool and quiet" },
};

/** Graphics setting: Automatic or one of the five tiers. A tier picked here is the owner's own choice and the automatic governor never changes it. */
export default function GraphicsPanel({ onClose }: { onClose: () => void }) {
  const tier = useQuality((s) => s.tier);
  const manual = useQuality((s) => s.manual);
  const device = useQuality((s) => s.device);
  const choose = useQuality((s) => s.choose);
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
      <p className="hint">The picture may pause for a moment while it rebuilds. If it ever feels slow, pick a lighter choice. Your own choice is never changed by the app.</p>
    </HudPanel>
  );
}
