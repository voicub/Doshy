import { mixHex, type SeasonPalette } from "@/lib/season";
import type { AreaKind, SiteArea, XY } from "@/lib/siteTypes";

/** Pixels along one side of the painted ground (it covers the site's square, 2 x radius). */
export const PAINT_PX = 2048;
const SNOW = "#eef4f9";

/** Paint order: what lies under goes first. */
const ORDER: AreaKind[] = ["residential", "grass", "farmland", "sand", "rock", "scrub", "wood", "paving", "water"];

/** The colour of an area kind in the garden's season (lawn kinds follow the lawn tint; the rest are whitened by snow cover). */
function areaColor(kind: AreaKind, pal: SeasonPalette): string {
  const snowy = (c: string, k = 0.85) => mixHex(c, SNOW, pal.snow * k);
  switch (kind) {
    case "residential":
    case "grass":
      return pal.ground;
    case "farmland":
      return snowy(mixHex("#c4aa6a", pal.ground, 0.3));
    case "scrub":
      return snowy(mixHex(pal.ground, "#355a2a", 0.45));
    case "wood":
      return snowy(mixHex(pal.ground, "#1f4222", 0.62), 0.7);
    case "sand":
      return snowy("#d6c38e");
    case "rock":
      return snowy("#8a867e");
    case "paving":
      return snowy("#8c8d90", 0.5);
    case "water":
      return "#2f627f";
  }
}

/** Fill `canvas` (PAINT_PX square, row 0 = north) with the site's ground: the lawn tint, then every area in its season colour. Site axes: x east, y south. */
export function paintAreas(canvas: HTMLCanvasElement, areas: readonly SiteArea[], radius: number, pal: SeasonPalette): void {
  const g = canvas.getContext("2d")!;
  const k = canvas.width / (2 * radius);
  const px = ([x, y]: XY): XY => [(x + radius) * k, (y + radius) * k];
  g.fillStyle = pal.ground;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const path = (rings: readonly (readonly XY[])[]) => {
    const p = new Path2D();
    for (const ring of rings) {
      ring.forEach((pt, i) => (i ? p.lineTo(...px(pt)) : p.moveTo(...px(pt))));
      p.closePath();
    }
    return p;
  };
  for (const kind of ORDER) {
    g.fillStyle = areaColor(kind, pal);
    for (const a of areas) if (a.kind === kind && a.ring.length >= 3) g.fill(path([a.ring, ...(a.holes ?? [])]), "evenodd");
  }
}
