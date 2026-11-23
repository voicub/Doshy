import { useMemo, useRef, type MutableRefObject } from "react";
import type { Def, Part } from "@/lib/catalog";
import { curtainLayers, curtainOpenness, curtainRig, isWindowCurtain, type CurtainLayer, type CurtainRig, type Drape } from "@/lib/curtain";
import { openingPoint } from "@/lib/geometry";
import { domainOf, isOpenState, type HAState } from "@/lib/ha";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { CURTAIN_EVENT } from "../ui/serviceActions";

const MAX_SPIN_RPM = 300; // faster than this aliases at 60 fps
const SWAY_RANGE = 1.0 + 0.25; // metres from an open window within which a curtain moves (plus a quarter of its width)

type SpinFx = { kind: "spin"; axis: "x" | "y" | "z"; rad: number; swing?: number; pivot?: number };
type SwayFx = { kind: "sway"; phase: number; still?: true; drape?: Drape; layer?: CurtainLayer };
export type Fx = SpinFx | SwayFx | undefined;
const swayable = (p: Part) => !p.r && !p.glow && p.s[2] <= 0.05 && p.s[1] >= 0.5;

/** What each part does when animated: spin (fans, drums) or, on curtains, sway from its top edge and, linked to a cover or sensor, draw open and closed (`drape`, moved by its own `layer`). */
function partEffects(def: Def, kind: string, rig: CurtainRig | null): Fx[] {
  const curtain = kind.includes("curtain");
  const drapes = new Map([...(rig?.sheer?.drapes ?? []), ...(rig?.blackout?.drapes ?? [])].map((d) => [d.i, d]));
  return def.parts.map((p, i) => {
    if (p.spin) return { kind: "spin", axis: p.spin.axis, rad: (Math.min(p.spin.rpm, MAX_SPIN_RPM) * 2 * Math.PI) / 60, swing: p.spin.swing && (p.spin.swing * Math.PI) / 180, pivot: p.spin.pivot };
    const drape = drapes.get(i);
    if (curtain && swayable(p)) return { kind: "sway", phase: i * 0.83, drape, layer: p.layer };
    if (drape) return { kind: "sway", phase: 0, still: true, drape, layer: p.layer }; // thick velvet: no sway, but it still moves
    return undefined;
  });
}

/** How an item's parts move: the per-part effects, and for a curtain the openness each layer is heading for and the card its tap opens. */
export type ItemMotion = {
  fx: Fx[];
  /** The openness each curtain layer settles at; undefined = no reading, so that layer keeps the look it was modelled with. */
  goals: Record<CurtainLayer, number | undefined>;
  /** A cover is behind either layer: the tap opens the curtain card instead of toggling one entity. */
  curtainCard: boolean;
  openCurtain: (x: number, y: number) => void;
  /** A window beside this curtain is open: it stirs. */
  nearOpen: boolean;
  /** Each moving part's own openness, damped toward its layer's goal. */
  drapeO: MutableRefObject<Record<number, number>>;
};

export function useItemMotion(item: Item, def: Def, st: HAState | undefined): ItemMotion {
  const curtain = item.kind.includes("curtain");
  const nearOpen = useStore(
    (s) =>
      curtain &&
      s.plan.openings.some((o) => {
        const p = o.entity && isOpenState(s.states[o.entity]) ? openingPoint(s.plan, o) : undefined;
        return !!p && Math.hypot(p.x - item.x, p.y - item.y) <= SWAY_RANGE + item.w / 4;
      }),
  );
  const rig = useMemo(() => (isWindowCurtain(item.kind, def.cat) ? curtainRig(def.parts) : null), [def, item.kind]);
  const fx = useMemo(() => partEffects(def, item.kind, rig), [def, item.kind, rig]);
  const layers = curtainLayers(item);
  const blackoutSt = useStore((s) => (layers.blackout.entity ? s.states[layers.blackout.entity] : undefined));
  const goals: Record<CurtainLayer, number | undefined> = { sheer: curtainOpenness(st, layers.sheer), blackout: curtainOpenness(blackoutSt, layers.blackout) };
  const curtainCard = !!rig && ((!!rig.sheer && domainOf(item.entity ?? "") === "cover") || (!!rig.blackout && domainOf(layers.blackout.entity ?? "") === "cover"));
  const openCurtain = (x: number, y: number) => window.dispatchEvent(new CustomEvent(CURTAIN_EVENT, { detail: { itemId: item.id, x, y } }));
  const drapeO = useRef<Record<number, number>>({});
  return { fx, goals, curtainCard, openCurtain, nearOpen, drapeO };
}
