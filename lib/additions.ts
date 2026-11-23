import { CATALOG } from "./catalog.ts";
import type { Item, Plan } from "./types.ts";
import { uid } from "./uid.ts";

const DEG = Math.PI / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Pieces added to the flat after plans were already saved. A saved plan is the user's own layout and is never replaced, so each addition is merged in once:
 * its key is recorded in `plan.added` and it is not applied again (a piece the user deletes stays deleted). Fresh starter plans get them all.
 */
type Addition = {
  key: string;
  items?: (Pick<Item, "kind" | "x" | "y"> & Partial<Pick<Item, "rot" | "elev" | "entity">>)[];
  /** Link every unlinked item of `kind` to `entity`. */
  link?: { kind: string; entity: string };
  /** Replace every item of the retired `kind` with these pieces, offset in the old item's own frame. */
  split?: { kind: string; into: { kind: string; lx: number; lz: number; elev?: number; entity?: string }[] };
};

export const ADDITIONS: Addition[] = [
  // Odin, the server tower on the floor against the front of the left drawer unit (left of the desk as you sit at it), switched by its smart plug
  { key: "odin-server", items: [{ kind: "of_server_odin", x: 4.83, y: 2.95, rot: 90, entity: "switch.odin" }] },
  // the ultrawide monitor, split from the desk and linked to its power plug; sits where it always stood on the desk top (desk at 5.31, 4.1 turned 90 degrees)
  { key: "office-monitor", items: [{ kind: "of_monitor_ultrawide", x: 5.51, y: 4.0, rot: 90, elev: 0.75, entity: "switch.office_pc_display" }] },
  // the light inside the hall's network rack
  { key: "rack-light", link: { kind: "lv_network_cabinet", entity: "light.rack_light" } },
  // the SONHULT coffee table nest was one piece; now two, each at its old place inside the nest (offsets in the old piece's own frame)
  { key: "split-coffee-nest", split: { kind: "lv_coffee_nest", into: [{ kind: "lv_coffee_table_tall", lx: 0.2, lz: -0.075 }, { kind: "lv_coffee_table_low", lx: -0.1, lz: 0.175 }] } },
  // the HEKTAR lamp was one item controlling the group of three bulbs; now the stand plus one head per bulb (top to bottom: bulbs 1, 2, 3), each on the pole axis
  {
    key: "split-hektar",
    split: {
      kind: "of_hektar_3head",
      into: [
        { kind: "of_hektar_stand", lx: 0, lz: 0 },
        ...[1.66, 1.31, 0.96].map((elev, i) => ({ kind: "of_hektar_head", lx: 0, lz: 0, elev, entity: `light.office_sofa_lamp_${i + 1}` })),
      ],
    },
  },
];

export function applyAdditions(plan: Plan): Plan {
  const done = new Set(plan.added ?? []);
  const todo = ADDITIONS.filter((a) => !done.has(a.key));
  if (!todo.length) return plan;
  let items = plan.items;
  for (const a of todo) {
    const { link, split } = a;
    if (link) items = items.map((it) => (it.kind === link.kind && !it.entity ? { ...it, entity: link.entity } : it));
    if (split) {
      items = items.flatMap((it) => {
        if (it.kind !== split.kind) return [it];
        const c = Math.cos(it.rot * DEG);
        const s = Math.sin(it.rot * DEG);
        return split.into.flatMap((p) => {
          const d = CATALOG[p.kind];
          // local (lx, lz) to plan: a piece turned `rot` degrees clockwise carries its offset round with it
          return d ? [{ ...it, id: uid(), kind: p.kind, x: r3(it.x + p.lx * c - p.lz * s), y: r3(it.y + p.lx * s + p.lz * c), w: d.w, d: d.d, h: d.h, elev: p.elev ?? it.elev, entity: p.entity }] : [];
        });
      });
    }
    for (const s of a.items ?? []) {
      const d = CATALOG[s.kind];
      if (d) items = [...items, { id: uid(), kind: s.kind, x: s.x, y: s.y, rot: s.rot ?? 0, w: d.w, d: d.d, h: d.h, ...(s.elev ? { elev: s.elev } : {}), ...(s.entity ? { entity: s.entity } : {}) }];
    }
  }
  return { ...plan, items, added: [...done, ...todo.map((a) => a.key)] };
}
