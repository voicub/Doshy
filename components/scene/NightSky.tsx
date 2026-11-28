"use client";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, LineSegments, Matrix3, Matrix4, Points, Vector3, type Camera, type Object3D } from "three";
import { sceneDirection } from "@/lib/nightskyFrame";
import { useNightSkySettings } from "@/lib/nightskySettings";
import { DAY_LIMIT, useNightSky, type NightSkyFrame } from "@/lib/nightskyUse";
import { bvToRgb, getStars } from "@/lib/stars";
import { isOrtho } from "./camera";
import { useReducedMotion } from "./motion";
import NightSkyIss from "./NightSkyIss";
import { lineLayer, makeSkyUniforms, pointLayer, type SkyUniforms } from "./nightSkyShader";

const DEG = Math.PI / 180;
/** Isometric view: the sky is drawn as if the camera looked at the horizon from the side it already faces (see docs/night-sky.md), tipped this far up, with this vertical field of view. */
const ISO_PITCH = 18 * DEG;
const ISO_FOV = 62 * DEG;
const IDENTITY = new Matrix3();
const BODY_RGB: Record<string, [number, number, number]> = {
  moon: [0.82, 0.9, 1],
  mercury: [0.8, 0.78, 0.74],
  venus: [1, 0.96, 0.82],
  mars: [1, 0.55, 0.36],
  jupiter: [1, 0.9, 0.74],
  saturn: [1, 0.86, 0.6],
};
const LINE_RGB: [number, number, number] = [0.2, 0.3, 0.5];

/** The Moon is drawn as a marker, not as a lit disc: a bigger, brighter dot the fuller it is. */
const moonMark = (illumination: number): number => -1 - 4 * illumination;

// scratch objects: the camera is read in the draw callback, which runs every frame
const TMP = { forward: new Vector3(), look: new Matrix4(), view: new Matrix4(), eye: new Vector3(), up: new Vector3(0, 1, 0), origin: new Vector3() };

/** Writes the camera part of the shared uniforms. In the walkthrough the real perspective camera is used, so the sky is exactly what the eyes see through a window. */
function followCamera(u: SkyUniforms, camera: Camera): void {
  if (isOrtho(camera)) {
    camera.getWorldDirection(TMP.forward);
    const heading = Math.atan2(TMP.forward.x, -TMP.forward.z);
    TMP.eye.set(Math.sin(heading) * Math.cos(ISO_PITCH), Math.sin(ISO_PITCH), -Math.cos(heading) * Math.cos(ISO_PITCH));
    TMP.look.lookAt(TMP.origin, TMP.eye, TMP.up);
    u.uView.value.setFromMatrix4(TMP.look).transpose();
    const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);
    const f = 1 / Math.tan(ISO_FOV / 2);
    u.uProj.value.set(f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.0002, -0.2, 0, 0, -1, 0);
  } else {
    u.uView.value.setFromMatrix4(camera.matrixWorldInverse);
    u.uProj.value.copy(camera.projectionMatrix);
  }
}

function starGeometry(count: number): BufferGeometry {
  const s = getStars();
  const n = Math.min(count, s.count);
  const pos = new Float32Array(n * 3);
  const rgb = new Float32Array(n * 3);
  const mag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [ra, dec] = [s.ra[i] * DEG, s.dec[i] * DEG];
    pos.set([Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)], i * 3);
    rgb.set(bvToRgb(s.bv[i]), i * 3);
    mag[i] = s.mag[i];
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("aRGB", new BufferAttribute(rgb, 3));
  g.setAttribute("aMag", new BufferAttribute(mag, 1));
  return g;
}

function lineGeometry(): BufferGeometry {
  const s = getStars();
  const pts: number[] = [];
  const at = (i: number) => {
    const [ra, dec] = [s.ra[i] * DEG, s.dec[i] * DEG];
    pts.push(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
  };
  for (const c of s.constellations) for (const [a, b] of c.lines) (at(a), at(b));
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
  return g;
}

/** The planets and the Moon, in the scene frame (already at their real height and compass direction). */
function fillBodies(g: BufferGeometry, frame: NightSkyFrame): void {
  const bodies = [...frame.planets, ...(frame.moon ? [frame.moon] : [])];
  // Reuse GPU attributes: replacing them every sky tick strands their old GPU buffers.
  if (!g.hasAttribute("position")) {
    g.setAttribute("position", new BufferAttribute(new Float32Array(24), 3));
    g.setAttribute("aRGB", new BufferAttribute(new Float32Array(24), 3));
    g.setAttribute("aMag", new BufferAttribute(new Float32Array(8), 1));
  }
  const pos = g.getAttribute("position") as BufferAttribute;
  const rgb = g.getAttribute("aRGB") as BufferAttribute;
  const mag = g.getAttribute("aMag") as BufferAttribute;
  bodies.forEach((b, i) => {
    pos.setXYZ(i, ...sceneDirection(b.alt, b.az, frame.bearing));
    rgb.setXYZ(i, ...(BODY_RGB[b.id] ?? [1, 1, 1]));
    mag.setX(i, b.id === "moon" ? moonMark(frame.moonIllumination) : b.mag);
  });
  pos.needsUpdate = true;
  rgb.needsUpdate = true;
  mag.needsUpdate = true;
  g.setDrawRange(0, bodies.length);
}

/**
 * The real night sky: the catalogue's stars, the planets, the Moon and (Detailed and up) constellation lines and the space station, drawn as a backdrop behind everything
 * else, at their true height and direction for the home's place and the plan's compass bearing. It draws nothing while the sun is up, and is not mounted at all in Eco and Light.
 * No animation keepalive: camera and Ultra twinkle uniforms update only when something else draws.
 */
export default function NightSky({ level }: { level: 1 | 2 | 3 }) {
  const frame = useNightSky();
  if (frame.limit <= DAY_LIMIT) return null;
  return <Dome frame={frame} level={level} />;
}

function Dome({ frame, level }: { frame: NightSkyFrame; level: 1 | 2 | 3 }) {
  const invalidate = useThree((s) => s.invalidate);
  const dpr = useThree((s) => s.viewport.dpr);
  const reduced = useReducedMotion();
  const showLines = useNightSkySettings((s) => s.lines) && level >= 2;
  const shared = useMemo(() => makeSkyUniforms(), []);
  const equatorial = useMemo(() => new Matrix3(), []);

  const layers = useMemo(() => {
    const follow = (o: Object3D, material: { uniformsNeedUpdate: boolean }) => {
      o.onBeforeRender = (_r, _s, camera) => {
        followCamera(shared, camera);
        // Observe an already-awake frame; never request another one for twinkle.
        if (shared.uTwinkle.value) shared.uTime.value = performance.now() / 1000;
        material.uniformsNeedUpdate = true;
      };
      o.frustumCulled = false;
    };
    const starMat = pointLayer(shared, equatorial, true);
    const stars = new Points(starGeometry(Infinity), starMat);
    stars.renderOrder = -12;
    follow(stars, starMat);
    const lineMat = lineLayer(shared, equatorial, LINE_RGB);
    const lines = new LineSegments(lineGeometry(), lineMat);
    lines.renderOrder = -11;
    follow(lines, lineMat);
    const bodyMat = pointLayer(shared, IDENTITY);
    const bodies = new Points(new BufferGeometry(), bodyMat);
    bodies.renderOrder = -10;
    follow(bodies, bodyMat);
    return { stars, lines, bodies, materials: [starMat, lineMat, bodyMat] };
  }, [shared, equatorial]);

  useEffect(() => {
    const m = frame.matrix;
    equatorial.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
    shared.uLimit.value = frame.limit;
    shared.uPx.value = dpr;
    shared.uTwinkle.value = level >= 3 && !reduced ? 1 : 0;
    fillBodies(layers.bodies.geometry, frame);
    invalidate(); // the sky creeps along at 15 degrees an hour: a drawn frame after each 30-second update is all the demand loop needs
  }, [frame, level, reduced, dpr, shared, equatorial, layers, invalidate]);

  useEffect(
    () => () => {
      for (const o of [layers.stars, layers.lines, layers.bodies]) o.geometry.dispose();
      for (const m of layers.materials) m.dispose();
    },
    [layers],
  );

  return (
    <>
      <primitive object={layers.stars} />
      {showLines && <primitive object={layers.lines} />}
      <primitive object={layers.bodies} />
      {level >= 2 && <NightSkyIss frame={frame} shared={shared} />}
    </>
  );
}
