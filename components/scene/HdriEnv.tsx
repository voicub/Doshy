"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchResourceFile } from "@/lib/dbApi";
import { keepAlive } from "@/lib/framePacer";
import { errorMessage } from "@/lib/guards";
import { useLighting } from "@/lib/lightingStore";
import { hdriGain, hdriMode, hdriRotation, wrapRad, type HdriSetting } from "@/lib/polyhavenEnv";
import { downloadAsset, keepAsResource, PhRequestError } from "@/lib/polyhavenClient";
import type { BuiltEnv } from "./hdriBuild";
import { hdriLive } from "./hdriLive";
import { live } from "./skyLive";
import SkyEnv from "./SkyEnv";

/** How soft the sky behind the building is (Studio view): the prefiltered map is small, so a crisp background would only show its pixels. */
const BACKGROUND_BLUR = 0.25;
/** Radians the sky must be off by before it is turned again (a quarter of a degree: the sun creeps, the picture follows in small steps). */
const TURN_STEP = 0.004;

/** The picture's bytes: the stored file first (so a device without internet keeps working); only when it is missing is it fetched again through this server and stored again. */
async function bytesOf(h: HdriSetting): Promise<{ bytes: ArrayBuffer; resourceId: string }> {
  const file = await fetchResourceFile(h.resourceId).catch(() => null);
  if (file && file.buf.byteLength > 0) return { bytes: file.buf, resourceId: h.resourceId };
  const bytes = await downloadAsset("hdri", h.assetId, h.res);
  const resourceId = await keepAsResource("hdri", { id: h.assetId, name: h.name, authors: h.authors }, bytes).catch(() => h.resourceId);
  return { bytes, resourceId };
}

type LoadProps = { hdri: HdriSetting; studio: boolean; skyGone: boolean; onReady: (ready: boolean) => void };

/** Loads the chosen sky and lights the scene with it. Renders nothing; the scene's own environment and background are put back when it goes. */
function HdriLoad({ hdri, studio, skyGone, onReady }: LoadProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const [built, setBuilt] = useState<BuiltEnv | null>(null);
  const latest = useRef(hdri);
  latest.current = hdri;
  const have = useRef<string | null>(null); // the picture that `built` was made from
  const turned = useRef(0);
  const needSun = hdri.matchSun && hdri.sun === undefined;
  const key = `${hdri.resourceId}|${hdri.assetId}|${hdri.res}`;

  // load and prefilter (again only when the picture changes, or when "match the sun" needs the pixels for the first time)
  useEffect(() => {
    if (have.current === key && !needSun) return;
    let alive = true;
    const { setStatus, patchHdri } = useLighting.getState();
    if (have.current !== key) setStatus({ state: "loading" });
    void (async () => {
      const h = latest.current;
      try {
        const { bytes, resourceId } = await bytesOf(h);
        const { buildEnv } = await import("./hdriBuild"); // not fetched at all on the tiers that never get here
        if (!alive) return;
        const b = buildEnv(gl, bytes, needSun);
        if (!alive) {
          b.target.dispose();
          return;
        }
        have.current = `${resourceId}|${h.assetId}|${h.res}`;
        const cur = latest.current;
        if (cur.resourceId === h.resourceId && cur.assetId === h.assetId) {
          if (resourceId !== h.resourceId) patchHdri({ resourceId, sun: b.sun }); // the file came back different: keep pointing at the stored one
          else if (b.sun !== undefined) patchHdri({ sun: b.sun });
        }
        setBuilt(b);
        onReady(true);
        setStatus({ state: "ready" });
      } catch (e) {
        if (!alive) return;
        // the previous sky (or the built-in one) stays; the picker says why
        setStatus({ state: "failed", message: e instanceof PhRequestError ? e.message : errorMessage(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [gl, key, needSun, onReady]);

  useEffect(() => () => built?.target.dispose(), [built]);
  useEffect(
    () => () => {
      onReady(false);
      useLighting.getState().setStatus({ state: "idle" });
    },
    [onReady],
  );

  // light the scene; turning off (or leaving the view) puts back what was there
  useLayoutEffect(() => {
    if (!built || !skyGone) return;
    const tex = built.target.texture;
    const prevEnv = scene.environment;
    const prevBackground = scene.background;
    const behind = studio && hdri.background;
    scene.environment = tex;
    if (behind) {
      scene.background = tex;
      scene.backgroundBlurriness = BACKGROUND_BLUR;
      scene.backgroundIntensity = hdriGain(hdri.intensity, true, 1);
    }
    const rot = hdriRotation(hdri, live.sunDir);
    turned.current = rot;
    scene.environmentRotation.y = rot;
    scene.backgroundRotation.y = rot;
    Object.assign(hdriLive, { on: true, studio, intensity: hdri.intensity });
    invalidate(); // the view may be idling between frames
    return () => {
      hdriLive.on = false;
      if (scene.environment === tex) scene.environment = prevEnv;
      if (scene.background === tex) {
        scene.background = prevBackground;
        scene.backgroundBlurriness = 0;
        scene.backgroundIntensity = 1;
      }
      scene.environmentRotation.y = 0;
      scene.backgroundRotation.y = 0;
    };
  }, [built, skyGone, scene, invalidate, studio, hdri.background, hdri.intensity, hdri.rotation, hdri.matchSun, hdri.sun]); // eslint-disable-line react-hooks/exhaustive-deps -- `hdri` is read whole, its fields above are what changes it

  // the sun moves through the day: keep the picture's sun on it (small steps, one frame each)
  useFrame(() => {
    const h = latest.current;
    if (!built || !skyGone || !h.matchSun || !h.sun) return;
    const rot = hdriRotation(h, live.sunDir);
    if (Math.abs(wrapRad(rot - turned.current)) < TURN_STEP) return;
    turned.current = rot;
    scene.environmentRotation.y = rot;
    scene.backgroundRotation.y = rot;
    keepAlive(false);
  });

  return null;
}

/**
 * The scene's image based light: the painted sky of SkyEnv, or (a real sky is chosen, Balanced and up) the chosen Poly Haven picture. Mounted only where the tier has image
 * based light at all; Eco and Light never get here, so they never fetch or decode a picture. The painted sky stays until the picture is ready, so the view is never unlit.
 * Studio view: the picture lights and (optionally) fills the background. Live (garden) view: only when the owner opted in, and dimmed by daylight (see `hdriGain`).
 */
export default function HdriEnv({ garden }: { garden: boolean }) {
  const hdri = useLighting((s) => s.hdri);
  const [ready, setReady] = useState(false);
  const wanted = hdri !== null && hdriMode(hdri, true, !garden) !== null;
  return (
    <>
      {!(wanted && ready) && <SkyEnv garden={garden} />}
      {wanted && hdri && <HdriLoad hdri={hdri} studio={!garden} skyGone={ready} onReady={setReady} />}
    </>
  );
}
