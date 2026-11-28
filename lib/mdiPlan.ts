// The Material Design icons a plan was given by hand (`item.params.icon` = `mdi:lamp`), kept IN the plan (`plan.icons`: name -> drawing) so the plan shows them offline, in a guest
// link, after an export and import and on another machine, without asking the icon service again. Only the icons some item actually names are kept, at most MAX_PLAN_ICONS.
// Automatic icons (taken from Home Assistant) are not here: they follow the live states and live in the browser's cache. Pure; the node test runner loads this file directly.
import { mdiOf, withIcon } from "./deviceIcons.ts";
import { isRecord } from "./guards.ts";
import { cleanMdiIcon, MAX_PLAN_ICONS, type MdiIcon } from "./mdi.ts";
import type { Item, Plan } from "./types.ts";

/** The icon names the items ask for by hand (no repeats). */
const namedIcons = (items: readonly Item[]): string[] => [...new Set(items.flatMap((i) => mdiOf(i.params) ?? []))];

/** `icons` cut down to clean drawings of names that `items` use (and at most MAX_PLAN_ICONS of them). */
export function iconsFor(items: readonly Item[], icons: unknown): Record<string, MdiIcon> {
  const stored = isRecord(icons) ? icons : {};
  const out: Record<string, MdiIcon> = {};
  for (const name of namedIcons(items).slice(0, MAX_PLAN_ICONS)) {
    const icon = Object.hasOwn(stored, name) ? cleanMdiIcon(stored[name]) : null;
    if (icon) out[name] = icon;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The plan with its icon list scrubbed on load (a hand-edited or imported file): the same plan when it was already clean, and one without the field when nothing is left. */
export function withMdiIcons(plan: Plan): Plan {
  if (plan.icons === undefined) return plan;
  const clean = iconsFor(plan.items ?? [], plan.icons);
  if (same(clean, plan.icons)) return plan;
  const { icons: _gone, ...rest } = plan;
  return Object.keys(clean).length ? { ...rest, icons: clean } : rest;
}

/**
 * The plan after the icon of one item was chosen (or cleared with `undefined`): the item's `params.icon` set, and the drawing of a Material Design icon stored with the plan.
 * `drawing` is needed when the choice is an `mdi:` name that is not stored yet. The same plan back when nothing changes (no empty undo step).
 */
export function withItemIcon(plan: Plan, itemId: string, icon: string | undefined, drawing: MdiIcon | undefined): Plan {
  if (!plan.items.some((item) => item.id === itemId)) return plan;
  const items: Item[] = plan.items.map((i) => {
    if (i.id !== itemId) return i;
    const params = withIcon(i.params, icon);
    if (same(params, i.params)) return i;
    const { params: _old, ...rest } = i;
    return params ? { ...rest, params } : rest;
  });
  if (namedIcons(items).length > MAX_PLAN_ICONS) return plan;
  const changed = items.some((i, n) => i !== plan.items[n]);
  const name = mdiOf(items.find((i) => i.id === itemId)?.params);
  const icons = iconsFor(items, { ...(plan.icons ?? {}), ...(name && drawing ? { [name]: drawing } : {}) });
  if (!changed && same(icons, plan.icons ?? {})) return plan;
  const { icons: _was, ...rest } = plan;
  return { ...rest, items, ...(Object.keys(icons).length ? { icons } : {}) };
}
