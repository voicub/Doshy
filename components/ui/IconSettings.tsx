"use client";
import type { IconSource } from "@/lib/mdi";
import { useIconSettings } from "@/lib/mdiStore";
import Segmented from "./Segmented";

const LABEL: Record<IconSource, string> = { ha: "From Home Assistant", doshy: "Doshy's own" };
const HINT: Record<IconSource, string> = {
  ha: "A linked device wears the icon Home Assistant gives it: the icon you set in Home Assistant, or the usual one for its kind (a door shows open or closed). An icon you pick yourself always wins, and a device without an icon keeps Doshy's.",
  doshy: "Linked devices keep Doshy's own icons. Icons you pick yourself still show.",
};

/** The "Device icons" row of the Display settings. Saved on this device. */
export default function IconSettings() {
  const source = useIconSettings((s) => s.source);
  const setSource = useIconSettings((s) => s.setSource);
  return (
    <section className="disp-sec">
      <h3 className="label disp-h">Device icons</h3>
      <Segmented<IconSource> label="Device icons" value={source} options={["ha", "doshy"]} format={(o) => LABEL[o]} onChange={setSource} />
      <p className="hint">{HINT[source]}</p>
    </section>
  );
}
