import type { DesignRow } from "./cars.design.ts";
import * as asia from "./cars.design.asia.ts";
import * as frit from "./cars.design.frit.ts";
import * as generic from "./cars.design.generic.ts";
import * as german from "./cars.design.german.ts";
import * as japan from "./cars.design.japan.ts";
import * as mitsubishi from "./cars.design.mitsubishi.ts";
import * as vag from "./cars.design.vag.ts";
import * as western from "./cars.design.western.ts";

// THE DESIGN TABLE, split by brand group into part files (each exports BRANDS = brand-wide defaults keyed by the brand name used in lib/cars.data.ts,
// and ROWS = per-model rows keyed by catalogue id). To add a model, add one line to the part file of its brand group.
const PARTS: { BRANDS: Record<string, DesignRow>; ROWS: Record<string, DesignRow> }[] = [generic, mitsubishi, vag, german, frit, japan, asia, western];

function join(pick: (p: (typeof PARTS)[number]) => Record<string, DesignRow>): Record<string, DesignRow> {
  const out: Record<string, DesignRow> = {};
  for (const part of PARTS) {
    for (const [key, row] of Object.entries(pick(part))) {
      if (key in out) throw new Error(`cars.design.data: duplicate entry "${key}"`);
      out[key] = row;
    }
  }
  return out;
}

export const BRAND_DESIGNS = join((p) => p.BRANDS);
export const MODEL_DESIGNS = join((p) => p.ROWS);
