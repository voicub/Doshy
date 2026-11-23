import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { plateCanvasSize, drawPlate } from "@/lib/plateDraw";
import { plateKey, type PlateEnd, type PlateStyle } from "@/lib/plate";

// Plate textures are cached by what they show (style, background and text) and shared by every car that shows the same plate.
// acquire/release count the users; the texture is disposed when the last one lets go (car removed or its text changed).

const cache = new Map<string, { tex: CanvasTexture; users: number }>();
const ANISOTROPY = 8;

export function acquirePlate(text: string, style: PlateStyle, end: PlateEnd): CanvasTexture {
  const key = plateKey(text, style, end);
  const hit = cache.get(key);
  if (hit) {
    hit.users++;
    return hit.tex;
  }
  const [w, h] = plateCanvasSize(style, end);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  drawPlate(canvas.getContext("2d")!, w, h, text, style, end);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = ANISOTROPY;
  tex.minFilter = LinearMipmapLinearFilter;
  cache.set(key, { tex, users: 1 });
  return tex;
}

export function releasePlate(text: string, style: PlateStyle, end: PlateEnd) {
  const key = plateKey(text, style, end);
  const hit = cache.get(key);
  if (!hit || --hit.users > 0) return;
  hit.tex.dispose();
  cache.delete(key);
}
