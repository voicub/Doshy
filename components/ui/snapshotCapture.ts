// Takes a picture of the 3D view: draws one frame at a larger pixel ratio, copies it out in the same task (the drawing buffer is not preserved, it is gone once the browser
// shows the next frame), and puts the view back. Sizes: lib/snapshotSize.ts. The canvas only is captured, so the HUD is never in the picture.
import type { RootState } from "@react-three/fiber";
import { ACESFilmicToneMapping, Box3, Color, InstancedMesh, Mesh, NoToneMapping, Vector3, type Object3D } from "three";
import { sceneBridge } from "@/lib/snapshotBridge";
import { captionLayout } from "@/lib/snapshotName";
import type { GlLimits, SnapshotSize } from "@/lib/snapshotSize";

const finite = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The live canvas state, or a plain-English reason there is none. */
export function liveScene(): RootState {
  const state = sceneBridge.get?.();
  if (!state || !state.gl.domElement.isConnected) throw new Error("The 3D view is not ready. Close this and try again in a moment.");
  return state;
}

/** What the graphics chip allows (0 = it did not say: lib/snapshotSize.ts then assumes the safe minimum). */
export function readGlLimits(state: RootState): GlLimits {
  const ctx = state.gl.getContext();
  const dims: unknown = ctx.getParameter(ctx.MAX_VIEWPORT_DIMS);
  return {
    maxTexture: finite(ctx.getParameter(ctx.MAX_TEXTURE_SIZE)),
    maxRenderbuffer: finite(ctx.getParameter(ctx.MAX_RENDERBUFFER_SIZE)),
    maxViewport: dims instanceof Int32Array && dims.length >= 2 ? [dims[0], dims[1]] : [0, 0],
  };
}

/** The view's size in CSS pixels. */
export const viewSize = (state: RootState): { width: number; height: number } => ({ width: state.size.width, height: state.size.height });

// What "transparent" removes: a flat plate bigger than this (the studio floor and its shadow plate are 140 m wide, the garden lawn and the satellite ground are about as big) is
// the backdrop's job in the picture. The building, furniture, paving and plants are all smaller or not flat.
const GROUND_MIN_SIDE = 40;
const GROUND_MAX_THICKNESS = 0.5;
const BOX = new Box3();
const EXTENT = new Vector3();

const isGroundPlate = (o: Object3D): boolean => {
  if (!(o instanceof Mesh) || o instanceof InstancedMesh) return false;
  BOX.setFromObject(o).getSize(EXTENT);
  return Math.max(EXTENT.x, EXTENT.z) > GROUND_MIN_SIDE && EXTENT.y < GROUND_MAX_THICKNESS;
};

/** Hides the ground plates; returns what to call to show them again. */
function hideGround(scene: Object3D): () => void {
  const hidden: Object3D[] = [];
  scene.updateMatrixWorld();
  scene.traverseVisible((o) => {
    if (isGroundPlate(o)) hidden.push(o);
  });
  for (const o of hidden) o.visible = false;
  return () => {
    for (const o of hidden) o.visible = true;
  };
}

/** The font the HUD's labels use, resolved (a canvas cannot read the CSS variable). */
function monoFamily(): string {
  const probe = Object.assign(document.createElement("span"), { style: "font-family: var(--mono); position: absolute; visibility: hidden" });
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family || "ui-monospace, Menlo, monospace";
}

/** A copy of `src` with the caption on a tinted plate in the lower left corner. */
function withCaption(src: HTMLCanvasElement, text: string): HTMLCanvasElement {
  const out = Object.assign(document.createElement("canvas"), { width: src.width, height: src.height });
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the caption.");
  ctx.drawImage(src, 0, 0);
  const family = monoFamily();
  const font = (px: number) => `500 ${px}px ${family}`;
  const box = captionLayout(out.width, out.height, (px) => {
    ctx.font = font(px);
    return ctx.measureText(text).width;
  });
  ctx.fillStyle = "rgba(6, 9, 12, 0.72)";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = "rgba(90, 215, 255, 0.55)";
  ctx.lineWidth = Math.max(1, box.font / 12);
  ctx.strokeRect(box.x + ctx.lineWidth / 2, box.y + ctx.lineWidth / 2, box.w - ctx.lineWidth, box.h - ctx.lineWidth);
  ctx.font = font(box.font);
  ctx.fillStyle = "#e8f1f5";
  ctx.fillText(text, box.textX, box.textY, box.w);
  return out;
}

/** Starts the PNG encoding now (the bitmap is copied when `toBlob` is called, so this must run in the task that drew the frame). */
function grab(canvas: HTMLCanvasElement, caption: string | null): Promise<Blob> {
  const source = caption ? withCaption(canvas, caption) : canvas;
  const { promise, resolve, reject } = Promise.withResolvers<Blob>();
  source.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser could not make the picture (it may have run out of memory). Try a smaller size."))), "image/png");
  return promise;
}

export type CaptureOptions = { size: SnapshotSize; transparent: boolean; caption: string | null };
export type Captured = { blob: Blob; width: number; height: number };

/**
 * The picture: pixel ratio, scene background and clear colour are changed for one frame and put back in `finally` (also when the frame throws), and the view is drawn once more
 * at its normal size so the screen does not show an empty canvas. The frame loop is not touched (`advance` draws one frame without the loop's after-effects), so a view that
 * idles stays idle and one that always draws goes on.
 */
export async function captureSnapshot({ size, transparent, caption }: CaptureOptions): Promise<Captured> {
  const state = liveScene();
  const { gl, scene } = state;
  const canvas = gl.domElement;
  const saved = { ratio: gl.getPixelRatio(), background: scene.background, alpha: gl.getClearAlpha(), color: gl.getClearColor(new Color()), tone: gl.toneMapping };
  let showGround: (() => void) | null = null;
  let blob: Promise<Blob>;
  let dims: { width: number; height: number };
  try {
    gl.setPixelRatio(size.ratio);
    if (transparent) {
      scene.background = null;
      gl.setClearColor(0x000000, 0);
      showGround = hideGround(scene);
      // The finishing passes (shading, glow, rays) write a solid alpha over the whole picture, so a see-through picture is drawn straight by the renderer. The scene is built for those
      // passes to tone-map it (the renderer's own tone mapping is off then): do that here, or it comes out flat.
      if (gl.toneMapping === NoToneMapping) gl.toneMapping = ACESFilmicToneMapping;
      gl.clear();
      gl.render(scene, state.camera);
    } else state.advance(state.clock.elapsedTime, false);
    dims = { width: canvas.width, height: canvas.height };
    blob = grab(canvas, caption);
  } finally {
    showGround?.();
    scene.background = saved.background;
    gl.setClearColor(saved.color, saved.alpha);
    gl.setPixelRatio(saved.ratio);
    gl.toneMapping = saved.tone;
    state.advance(state.clock.elapsedTime, false); // the screen shows the normal picture straight away
    state.invalidate();
  }
  return { blob: await blob, ...dims };
}
