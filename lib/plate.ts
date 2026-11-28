// Number plates: what the owner may type, the plate styles and their real sizes. Pure data; the picture is drawn in components/scene/plateTexture.ts.

export type PlateStyle = "eu" | "ro" | "uk" | "us" | "plain" | "blank";
export type PlateEnd = "front" | "rear";

export const PLATE_MAX = 10;
export const DEFAULT_PLATE_STYLE: PlateStyle = "eu";

export const PLATE_STYLES: { id: PlateStyle; label: string }[] = [
  { id: "eu", label: "EU" },
  { id: "ro", label: "Romania" },
  { id: "uk", label: "UK" },
  { id: "us", label: "US" },
  { id: "plain", label: "Plain" },
  { id: "blank", label: "Blank" },
];

/**
 * What the plate may carry: A-Z, 0-9, space and hyphen, upper-cased, accents dropped (Ă -> A), at most PLATE_MAX characters.
 * `typing` keeps a trailing space or hyphen so a field can be typed into ("B " then "B 1").
 */
export function sanitizePlate(text: string, typing = false): string {
  const t = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/^[ -]+/, "")
    .slice(0, PLATE_MAX);
  return typing ? t : t.trimEnd();
}

export const isPlateStyle = (v: unknown): v is PlateStyle => PLATE_STYLES.some((s) => s.id === v);

/** The plate of a car item from its `params`: no text and the EU look by default, so a car you never touched shows a plain blank plate. */
export function plateOf(params: Record<string, number | string | boolean> | undefined): { text: string; style: PlateStyle } {
  const style = params?.plateStyle;
  const text = params?.plate;
  return { text: typeof text === "string" ? sanitizePlate(text) : "", style: isPlateStyle(style) ? style : DEFAULT_PLATE_STYLE };
}

/** Real plate sizes in metres [width, height]: EU / Romanian / UK 520 x 110 mm (UK 111), US 12 x 6 in. */
export function plateSize(style: PlateStyle, _end: PlateEnd): [number, number] {
  if (style === "us") return [0.305, 0.152];
  if (style === "uk") return [0.52, 0.111];
  return [0.52, 0.11];
}

/** Plate background: only a UK rear plate is yellow. */
export const plateYellow = (style: PlateStyle, end: PlateEnd) => style === "uk" && end === "rear";

/** Texture cache key: two plates with the same key look the same. The end only matters where it changes the look (UK yellow rear). */
export const plateKey = (text: string, style: PlateStyle, end: PlateEnd) => `${style}${plateYellow(style, end) ? "-yellow" : ""}|${style === "blank" ? "" : text}`;

/** Rear and front plate sit on the bumper in a 560 x 170 mm holder whatever the plate size. */
export const PLATE_HOLDER: [number, number] = [0.56, 0.17];
/** Plate centre above the bumper surface: the 6 mm plate box sits on a 3.5 mm holder. */
export const PLATE_LIFT = 0.0072;

/** Euler angles (x, y, z) of a plate box (its picture faces +z) on a bumper whose outward normal leans up by `ny` (the sine of the tilt): front plates face +z, rear plates are turned half a turn about y. */
export const plateRotation = (end: PlateEnd, ny: number): [number, number, number] => (end === "front" ? [-Math.asin(ny), 0, 0] : [Math.asin(ny), Math.PI, 0]);
