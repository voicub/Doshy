import type { RainInput, Sim } from "./rainSim";

const BUCKETS = [
  { z: 0.45, w: 0.8, a: 0.16 },
  { z: 0.7, w: 1.1, a: 0.26 },
  { z: 1, w: 1.5, a: 0.38 },
];

export type RainSprites = { drop: HTMLCanvasElement; flake: HTMLCanvasElement; fog: HTMLCanvasElement };

function drawFog(ctx: CanvasRenderingContext2D, s: Sim, fogImg: HTMLCanvasElement) {
  const { W, H } = s;
  const size = Math.max(W, H) * 0.9;
  ctx.globalAlpha = 0.4 * s.lv.fog * s.lv.show;
  for (const b of s.blobs) {
    const sz = size * b.s;
    ctx.drawImage(fogImg, b.x * W - sz / 2, b.y * H + Math.sin(b.ph) * H * 0.06 - sz / 2, sz, sz);
  }
}

function drawTrail(ctx: CanvasRenderingContext2D, pts: number[], w: number, a: number, show: number) {
  if (pts.length < 4) return;
  ctx.globalAlpha = 0.1 * a * show;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

/** Tint, streaks (batched per brightness bucket: one stroke each) and the trails drops leave on the glass. */
function drawRain(ctx: CanvasRenderingContext2D, s: Sim, inp: RainInput) {
  const { lv, W, H } = s;
  const show = lv.show;
  ctx.fillStyle = `rgba(130,160,185,${0.035 * lv.rain * show})`;
  ctx.fillRect(0, 0, W, H);

  ctx.lineCap = "round";
  const norm = Math.hypot(inp.tilt, 1);
  const ux = inp.tilt / norm;
  const uy = 1 / norm;
  const k = (0.55 + 0.45 * lv.rain) * show;
  BUCKETS.forEach((bk, bi) => {
    const lo = bi ? BUCKETS[bi - 1].z : 0;
    ctx.strokeStyle = `rgba(205,225,242,${bk.a * k})`;
    ctx.lineWidth = bk.w;
    ctx.beginPath();
    for (const st of s.streaks) {
      if (st.z <= lo || st.z > bk.z) continue;
      const len = (14 + 30 * st.z) * (0.7 + 0.5 * lv.rain);
      ctx.moveTo(st.x, st.y);
      ctx.lineTo(st.x - ux * len, st.y - uy * len);
    }
    ctx.stroke();
  });

  ctx.strokeStyle = "rgb(170,205,235)";
  for (const t of s.trails) drawTrail(ctx, t.pts, t.w, t.a, show);
  for (const d of s.drops) if (d.sliding) drawTrail(ctx, d.trail, Math.max(0.8, d.r * 0.9), 1, show);
}

function drawDrops(ctx: CanvasRenderingContext2D, s: Sim, dropImg: HTMLCanvasElement) {
  for (const d of s.drops) {
    ctx.globalAlpha = Math.min(1, d.life / 2) * s.lv.show * (d.sliding ? 1 : 0.85);
    const h = d.sliding ? d.r * 2.5 : d.r * 2;
    ctx.drawImage(dropImg, d.x - d.r, d.y - d.r, d.r * 2, h);
  }
}

function drawFlakes(ctx: CanvasRenderingContext2D, s: Sim, flakeImg: HTMLCanvasElement) {
  for (const f of s.flakes) {
    const r = 1 + 2.4 * f.z;
    ctx.globalAlpha = (0.22 + 0.33 * f.z) * s.lv.show;
    ctx.drawImage(flakeImg, f.x - r, f.y - r, r * 2, r * 2);
  }
}

/** Paint one frame: fog, rain, glass drops, snow, lightning flash (back to front). */
export function drawScene(ctx: CanvasRenderingContext2D, s: Sim, inp: RainInput, sprites: RainSprites) {
  ctx.clearRect(0, 0, s.W, s.H);
  ctx.globalAlpha = 1;
  if (s.lv.show < 0.005) return;
  if (s.lv.fog > 0.005) drawFog(ctx, s, sprites.fog);
  if (s.lv.rain > 0.005) drawRain(ctx, s, inp);
  drawDrops(ctx, s, sprites.drop);
  drawFlakes(ctx, s, sprites.flake);
  if (s.flash > 0.01) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(232,241,255,${0.16 * s.flash * s.lv.show})`;
    ctx.fillRect(0, 0, s.W, s.H);
  }
  ctx.globalAlpha = 1;
}
