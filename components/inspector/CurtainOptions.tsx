"use client";
import type { ReactNode } from "react";
import { CATALOG } from "@/lib/catalog";
import { curtainLayers, curtainOpenness, curtainRig, LAYER_NAME, opennessWords, readingOf, type CurtainLayer, type Reading } from "@/lib/curtain";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import EntityPicker from "../ui/EntityPicker";
import NumField from "../ui/NumField";
import { CurtainAutomation } from "./CurtainAutomation";
import { Group } from "./shared";
import "./curtainOptions.css";

const CURTAIN_DOMAINS = ["cover", "binary_sensor", "sensor", "sun", "input_boolean", "input_number", "number", "switch"]; // a motorised curtain, or anything that says when it should be open: a light sensor, the sun, a switch

const HOW: Record<Reading, string> = {
  none: "Link a cover, a sensor or the sun, and the curtain opens and closes by itself.",
  cover: "Follows the cover: its position, or open / closed.",
  sun: "Open while the sun is up, closed at night.",
  percent: "Follows the percentage: 100% is fully open.",
  number: "A plain number: say from which value the curtain is open.",
  switch: "Open while it is on, closed while it is off.",
};
const HOW_BLACKOUT_NONE = "Link the cover of the heavy curtain. It can then close by itself at dawn, and you can open and close it from here.";

/** The keys one layer keeps in `item.params`. */
const KEYS: Record<CurtainLayer, { invert: string; above: string }> = {
  sheer: { invert: "curtainInvert", above: "curtainAbove" },
  blackout: { invert: "blackoutInvert", above: "blackoutAbove" },
};

function LayerGroup({ item, layer, label, prefer, children }: { item: Item; layer: CurtainLayer; label: string; prefer: readonly string[]; children?: ReactNode }) {
  const settings = curtainLayers(item)[layer];
  const st = useStore((s) => (settings.entity ? s.states[settings.entity] : undefined));
  const patch = useStore((s) => s.patch);
  const reading = readingOf(st);
  const open = curtainOpenness(st, settings);
  const keys = KEYS[layer];
  const set = (change: Record<string, number | boolean>) => patch("item", item.id, { params: { ...item.params, ...change } });
  const link = (entity: string | undefined) => {
    if (layer === "sheer") return patch("item", item.id, { entity });
    const { blackoutEntity: _gone, ...rest } = item.params ?? {};
    patch("item", item.id, { params: entity ? { ...rest, blackoutEntity: entity } : rest });
  };
  const unit = st?.attributes.unit_of_measurement ?? "";
  return (
    <Group label={label}>
      <EntityPicker label="Cover or sensor" value={settings.entity} onChange={link} domains={CURTAIN_DOMAINS} preferAreas={prefer} />
      <small className="field-note">{layer === "blackout" && reading === "none" ? HOW_BLACKOUT_NONE : HOW[reading]}</small>
      {reading === "number" && <NumField label="Open at or above" unit={unit} value={settings.above ?? 0} step={10} live={false} onChange={(v) => set({ [keys.above]: v })} />}
      {reading !== "none" && (
        <label className="cur-check">
          <input type="checkbox" checked={settings.invert} onChange={(e) => set({ [keys.invert]: e.target.checked })} /> Reverse (open when it is off or below)
        </label>
      )}
      {st && <small className="field-note" role="status">{open === undefined ? "No reading yet: the curtain stays as drawn." : `Now: ${opennessWords(open)}`}</small>}
      {children}
    </Group>
  );
}

/**
 * Window curtains have two layers, each linked on its own: the sheer net (`item.entity`) and the heavy sun-blocking curtain (`params.blackoutEntity`).
 * A piece with one layer shows one group. A layer stays as drawn until its entity has a reading.
 */
export default function CurtainOptions({ item, prefer }: { item: Item; prefer: readonly string[] }) {
  const rig = curtainRig(CATALOG[item.kind]?.parts ?? []);
  if (!rig) return null;
  return (
    <>
      {rig.sheer && <LayerGroup item={item} layer="sheer" label={rig.blackout ? LAYER_NAME.sheer : "Curtain"} prefer={prefer} />}
      {rig.blackout && <LayerGroup item={item} layer="blackout" label={LAYER_NAME.blackout} prefer={prefer}><CurtainAutomation item={item} /></LayerGroup>}
    </>
  );
}
