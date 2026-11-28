import { CATALOG } from "@/lib/catalog";
import { LIGHT_KINDS } from "@/lib/lineKinds";
import type { Item } from "@/lib/types";
import { PAPER } from "./BlueprintPaper";

const LAMP = "#ffd9a0"; // the warm colour of the lamps themselves
const LINE_KINDS = new Map(LIGHT_KINDS.map((k) => [k.item, k]));
const MIN_PX = 3.5; // a lamp is a few centimetres wide: keep it a readable dot when the plan is zoomed out

/**
 * The lamps a Garden lines "Lights" line put on the plan (street lights, bollards, path lights, strings of festoon lights). Furniture is not drawn in plan
 * mode, but a drawn line of lamps would otherwise vanish the moment it is finished; these are small dots (a thin line for a string) and are never picked.
 */
export default function LampMarks({ items, px }: { items: Item[]; px: number }) {
  return (
    <g pointerEvents="none">
      {items.map((it) => {
        const kind = LINE_KINDS.get(it.kind);
        if (!kind || !CATALOG[it.kind]) return null;
        if (kind.span) {
          const a = (it.rot * Math.PI) / 180;
          const [dx, dy] = [Math.cos(a) * (it.w / 2), Math.sin(a) * (it.w / 2)];
          return <line key={it.id} x1={it.x - dx} y1={it.y - dy} x2={it.x + dx} y2={it.y + dy} stroke={LAMP} strokeWidth={1.5 * px} strokeDasharray={`${3 * px} ${3 * px}`} />;
        }
        return <circle key={it.id} cx={it.x} cy={it.y} r={Math.max(Math.max(it.w, it.d) / 2, MIN_PX * px)} fill={PAPER} stroke={LAMP} strokeWidth={1.5 * px} />;
      })}
    </g>
  );
}
