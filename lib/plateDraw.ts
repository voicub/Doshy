import { plateSize, plateYellow, type PlateEnd, type PlateStyle } from "./plate.ts";

// Draws a number plate with the plain 2D canvas API: used for the texture on the car (components/scene/plateTexture.ts) and the
// live preview in the inspector. A DIN-like condensed bold face, embossed border, screw heads, a blue country band where the style has one.

const BLUE = "#0a3a9c";
const STAR = "#ffcc00";
const INK = "#101113";
const FONT = '"DIN Alternate", "Bahnschrift", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';

/** Pixel size of a plate image `width` wide, keeping the real aspect ratio. */
export function plateCanvasSize(style: PlateStyle, end: PlateEnd, width = 1024): [number, number] {
  const [pw, ph] = plateSize(style, end);
  return [width, Math.round((width * ph) / pw)];
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

function screw(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, "#e8eaed");
  g.addColorStop(1, "#7d8288");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,22,25,0.75)";
  ctx.lineWidth = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.62, y + r * 0.2);
  ctx.lineTo(x + r * 0.62, y - r * 0.2);
  ctx.stroke();
}

/** The blue country band on the left edge: a ring of twelve stars and the country code. */
function euBand(ctx: CanvasRenderingContext2D, bw: number, h: number, code: string) {
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, bw, h);
  ctx.fillStyle = STAR;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(bw / 2 + Math.cos(a) * h * 0.19, h * 0.34 + Math.sin(a) * h * 0.19, h * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${h * 0.21}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(code, bw / 2, h * 0.8);
}

/** Embossed border: dark line with a light edge just inside it. */
function plateBorder(ctx: CanvasRenderingContext2D, w: number, h: number, us: boolean, r: number) {
  const inset = h * (us ? 0.06 : 0.05);
  ctx.strokeStyle = us ? BLUE : INK;
  ctx.lineWidth = h * 0.028;
  roundRect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, r * 0.7);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(1, h * 0.008);
  roundRect(ctx, inset + h * 0.02, inset + h * 0.02, w - 2 * (inset + h * 0.02), h - 2 * (inset + h * 0.02), r * 0.6);
  ctx.stroke();
}

export function drawPlate(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, style: PlateStyle, end: PlateEnd) {
  const us = style === "us";
  const band = style === "eu" || style === "ro";
  const r = h * (us ? 0.09 : 0.14);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.clip();
  ctx.fillStyle = plateYellow(style, end) ? "#f2c20f" : us ? "#e9eef1" : "#f5f5f1";
  ctx.fillRect(0, 0, w, h);
  const bw = band ? w * 0.085 : 0;
  if (band) euBand(ctx, bw, h, style === "ro" ? "RO" : "EU");
  ctx.restore();

  plateBorder(ctx, w, h, us, r);

  const sr = h * 0.05;
  screw(ctx, band ? bw / 2 : h * 0.13, h / 2, sr);
  screw(ctx, w - h * 0.13, h / 2, sr);
  if (style === "blank" || !text) return;
  plateText(ctx, w, h, text, us, bw);
}

/** The registration: squeezed horizontally to fit between the band and the right edge, with a light emboss behind. `bw` is the band's width (0 without one). */
function plateText(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, us: boolean, bw: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (us) {
    ctx.fillStyle = BLUE;
    ctx.font = `700 ${h * 0.16}px ${FONT}`;
    ctx.fillText("AMERICA", w / 2, h * 0.21);
  }
  const x0 = bw + h * 0.26;
  const x1 = w - h * 0.26;
  const fs = h * (us ? 0.46 : 0.68);
  ctx.font = `700 ${fs}px ${FONT}`;
  const raw = ctx.measureText(text).width;
  const squeeze = Math.min(1, (x1 - x0) / Math.max(raw, 1));
  const cx = (x0 + x1) / 2;
  const cy = h * (us ? 0.63 : 0.53);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(squeeze, 1);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(text, -h * 0.008, -h * 0.008);
  ctx.fillStyle = INK;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
