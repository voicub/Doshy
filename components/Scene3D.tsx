"use client";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "@/lib/mathUtil";
import { Object3D, Vector3, type DirectionalLight, type HemisphereLight, type MeshStandardMaterial } from "three";
import { useKnobs, useQuality, reportRenderer } from "@/lib/quality";
import { framePolicy, frameFlags } from "@/lib/framePacer";
import { useVp } from "@/lib/useVp";
import { probe } from "./scene/devProbe";
import { planBounds } from "@/lib/geometry";
import { mottleTexture, tiledTexture } from "@/lib/textures";
import { useStore, type Environment } from "@/lib/store";
import Levels from "./scene/Levels";
import { baseElevation } from "@/lib/stairs";
import Scatter from "./scene/Scatter";
import GroundAreas from "./scene/GroundAreas";
import SeasonGarden from "./scene/season/SeasonGarden";
import Surroundings from "./scene/site/Surroundings";
import { useSurroundings } from "./scene/site/useSurroundings";
import FoliageDriver from "./scene/FoliageDriver";
import HolidayDecor from "./scene/season/HolidayDecor";
import { seasonGroundColor, seasonMottleColor } from "@/lib/season";
import { useSky } from "@/lib/useSky";
import { useSkySettings } from "@/lib/sky";
import CloudShadows from "./scene/CloudShadows";
import SkyDriver from "./scene/SkyDriver";
import Weather from "./scene/Weather";
import { live } from "./scene/skyLive";
import { useWetSurface } from "./scene/useWet";
import PostFx, { Studio } from "./scene/PostFx";
import QualityGovernor from "./scene/QualityGovernor";
import FrameDriver from "./scene/FrameDriver";
import { GlGuard, GlNotice } from "./scene/GlStatus";
import { useFramePaused } from "./scene/useFramePaused";
import { useFrameWatchdog } from "./scene/useFrameWatchdog";
import SkyEnv from "./scene/SkyEnv";
import Rig from "./scene/Rig";
import StudioFloor from "./scene/StudioFloor";
import EditOverlay from "./scene/edit/EditOverlay";
import FurnitureEditor3D from "./scene/edit/FurnitureEditor3D";
import SelectionPicker from "./scene/edit/SelectionPicker";
import Flows from "./scene/Flows";
import { useLiveLayer } from "@/lib/liveLayer";
import DeclutterLayer from "./scene/DeclutterLayer";
import ItemPulse from "./scene/ItemPulse";

const GARDEN_SHADOW_EXTENT = 32; // items on the lawn and drive cast and receive sun shadows this far (m) around the building centre
const STUDIO_SHADOW_MARGIN = 14; // metres of sun shadow beyond the building's corners on the studio ground
const BACKDROP: Record<Environment, string> = { studio: "#030406", garden: "#0a0c11" };

/** The garden's lawn. While the real surroundings show (`covered`) their ground replaces it (same lawn look near the plan), so this plane only stays as the invisible catcher of a double click. */
function Ground({ cx, cz, covered }: { cx: number; cz: number; covered: boolean }) {
  const tex = useMemo(() => tiledTexture("grass", 140, 140), []);
  const mottle = useMemo(() => mottleTexture(140, 140), []);
  const setFocusRoom = useStore((s) => s.setFocusRoom);
  const { season, mix } = useSky().season;
  const grass = seasonGroundColor(season, Math.round(mix * 50) / 50);
  const mott = seasonMottleColor(season, Math.round(mix * 50) / 50);
  const mat = useRef<MeshStandardMaterial>(null);
  useWetSurface(mat, grass, 1, 0.5, 0.4);
  useEffect(() => () => tex.dispose(), [tex]);
  useEffect(() => () => mottle.dispose(), [mottle]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.002, cz]} receiveShadow onDoubleClick={() => setFocusRoom(null)}>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial ref={mat} map={tex} color={grass} roughness={1} visible={!covered} />
      </mesh>
      {!covered && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.004, cz]} renderOrder={1} raycast={() => null}>
          <planeGeometry args={[140, 140]} />
          <meshBasicMaterial color={mott} alphaMap={mottle} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

/** How far the sun (directional, so only its shadow camera cares) stands from the flat: casters nearer to the sun than SUN_DISTANCE - 0.5 m (the shadow camera's near plane) cast a shadow, so it must reach past the neighbours that cast shadows (SiteBuildings SHADOW_M plus a block's depth). */
const SUN_DISTANCE = 60;
/** Eco and Light: the sun's shadow map is redrawn once the sun has moved this far (m^2, at SUN_DISTANCE: about a third of a degree), besides when the scene changed. */
const SUN_REDRAW_M2 = 0.1;
/** Eco: the sun's shadow map covers the building and this many metres around it. */
const TIGHT_SHADOW_MARGIN = 9;

const NO_ENV_FILL = 1.45;
/** Sun (moon at night) and fill follow the live sky: direction, colour and strength are written each frame, never through React. */
function Lighting({ cx, cz, extent, garden }: { cx: number; cz: number; extent: number; garden: boolean }) {
  const { shadowMap, shadowSoft, fx, studioEnv } = useKnobs();
  const lazy = fx !== "film"; // Eco and Light redraw the sun's shadow map only when something that casts a shadow may have changed (the camera alone never does); the film tiers redraw it every frame as always
  const gl = useThree((s) => s.gl);
  const radius = clamp((shadowSoft * shadowMap) / (2 * extent), 1, 12); // texels of filter for a constant soft edge in metres
  const target = useMemo(() => new Object3D(), []);
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const drawnSun = useRef(new Vector3(Infinity, 0, 0)); // where the sun stood when its shadow map was last drawn
  useEffect(() => {
    gl.shadowMap.autoUpdate = !lazy;
    gl.shadowMap.needsUpdate = true;
    return () => void (gl.shadowMap.autoUpdate = true);
  }, [gl, lazy, shadowMap, extent]);
  useFrame(() => {
    const L = live.look;
    const d = live.sunDir;
    if (hemi.current) {
      hemi.current.color.copy(L.hemiSky);
      hemi.current.groundColor.copy(L.hemiGround);
      hemi.current.intensity = L.hemiI * (studioEnv ? 1 : NO_ENV_FILL); // without the soft-box environment the fill light is a little stronger, so shadows do not go dull
    }
    if (sun.current) {
      sun.current.position.set(cx + d.x * SUN_DISTANCE, d.y * SUN_DISTANCE, cz + d.z * SUN_DISTANCE);
      sun.current.color.copy(L.sunC);
      sun.current.intensity = L.sunI;
      if (lazy && (frameFlags.shadowsDirty || drawnSun.current.distanceToSquared(sun.current.position) > SUN_REDRAW_M2)) {
        gl.shadowMap.needsUpdate = true;
        drawnSun.current.copy(sun.current.position);
      }
    }
    if (fill.current) {
      fill.current.position.set(cx - d.x * SUN_DISTANCE * 0.8, Math.max(0.25, d.y * 0.6) * SUN_DISTANCE, cz - d.z * SUN_DISTANCE * 0.8);
      fill.current.color.copy(L.fillC);
      fill.current.intensity = L.fillI;
    }
  });
  return (
    <>
      <hemisphereLight ref={hemi} />
      <primitive object={target} position={[cx, 0, cz]} />
      <directionalLight
        key={`${extent}-${garden}-${shadowMap}`}
        ref={sun}
        target={target}
        castShadow
        shadow-mapSize={[shadowMap, shadowMap]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={radius}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={0.5}
        shadow-camera-far={SUN_DISTANCE + 70}
      />
      <directionalLight ref={fill} target={target} />
    </>
  );
}

/** The canvas's WebGL context: a 24/7 display will lose it some day (driver reset, sleep, memory pressure). Say so in plain words, and build the view again when it comes back. */
function useGlRecovery(direct: boolean) {
  const [epoch, setEpoch] = useState(0); // a new epoch builds the whole canvas again (a clean graphics context)
  const [lost, setLost] = useState(false);
  const rebuild = () => {
    setLost(false);
    setEpoch((n) => n + 1);
  };
  const canvasKey = `${epoch}-${direct}`;
  const keyRef = useRef(canvasKey);
  keyRef.current = canvasKey; // written during render, before the replaced canvas is torn down
  const onCreated = ({ gl, scene, camera }: RootState) => {
    const mine = keyRef.current;
    gl.localClippingEnabled = true;
    probe({ gl, scene, camera, store: useStore, sky: useSkySettings, quality: useQuality });
    reportRenderer(gl.getContext());
    gl.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      if (keyRef.current === mine) setLost(true); // a canvas that was replaced (new epoch, tier switch) is thrown away on purpose and releases its context: not a loss
    });
    gl.domElement.addEventListener("webglcontextrestored", () => {
      if (keyRef.current === mine) rebuild();
    });
  };
  return { epoch, lost, rebuild, onCreated };
}

type Frame = { cx: number; cz: number; half: number };

/** Everything inside the canvas: sky, lights, ground, the building and its levels, weather, the editors' 3D parts and the post stack. */
function SceneContents({ frame, extent, demandCapMs, direct }: { frame: Frame; extent: number; demandCapMs: number | null; direct: boolean }) {
  const k = useKnobs();
  const plan = useStore((s) => s.plan);
  const environment = useStore((s) => s.environment);
  const view = useStore((s) => s.view);
  const powerLayer = useLiveLayer((s) => s.layer === "power"); // the power lines (energy flows) belong to the Power layer of the Live view
  const garden = environment === "garden";
  const surroundings = useSurroundings() !== null;
  return (
    <>
      <color attach="background" args={[BACKDROP[environment]]} />
      <SkyDriver backdrop={BACKDROP[environment]} />
      <QualityGovernor />
      {demandCapMs !== null && <FrameDriver capMs={demandCapMs} />}
      <Rig />
      <DeclutterLayer />
      <Lighting cx={frame.cx} cz={frame.cz} extent={extent} garden={garden} />
      {k.ibl ? <SkyEnv garden={garden} /> : k.studioEnv && <Studio />}
      <FoliageDriver />
      {garden ? (
        <>
          <Ground cx={frame.cx} cz={frame.cz} covered={surroundings} />
          <Surroundings />
          <Scatter plan={plan} />
          <SeasonGarden cx={frame.cx} cz={frame.cz} />
          {k.ambient && <CloudShadows cx={frame.cx} cz={frame.cz} />}
        </>
      ) : (
        <StudioFloor cx={frame.cx} cz={frame.cz} />
      )}
      <GroundAreas />
      <Levels />
      <group position-y={baseElevation(plan)}>
        <HolidayDecor />
      </group>
      <Weather cx={frame.cx} cz={frame.cz} half={frame.half} />
      {view === "furniture" && <FurnitureEditor3D />}
      {view === "ha" && <SelectionPicker />}
      {(view === "ha" || (view === "live" && powerLayer)) && <Flows interactive={view === "ha"} />}
      <ItemPulse />
      {!direct && <PostFx />}
    </>
  );
}

/** The 3D view: the canvas, its recovery from a lost graphics context, and the editors' overlays. */
export default function Scene3D() {
  const k = useKnobs();
  const tier = useQuality((s) => s.tier);
  const { vp, kiosk } = useVp();
  const policy = framePolicy(tier, vp, kiosk);
  const paused = useFramePaused();
  const plan = useStore((s) => s.plan);
  const environment = useStore((s) => s.environment);
  const view = useStore((s) => s.view);
  const garden = environment === "garden";
  const direct = k.fx === "none"; // drawn straight to the screen: no post stack, so the browser's own multisampling and the materials' tone mapping do the work
  const { epoch, lost, rebuild, onCreated } = useGlRecovery(direct);
  useFrameWatchdog(!paused, rebuild); // a view that stops drawing, could not start, or lost its graphics for good is built again by itself

  // Frame the building (walls), not the lawn.
  const frame = useMemo(() => {
    const b = planBounds(plan) ?? { x0: 4, y0: 4, x1: 16, y1: 12 };
    return { cx: (b.x0 + b.x1) / 2, cz: (b.y0 + b.y1) / 2, half: Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 };
  }, [plan]);
  const extent = k.shadowTight ? Math.max(8, Math.ceil(frame.half + TIGHT_SHADOW_MARGIN)) : garden ? GARDEN_SHADOW_EXTENT : Math.max(8, Math.ceil(frame.half + STUDIO_SHADOW_MARGIN));

  return (
    <>
      <GlGuard key={epoch} onRetry={rebuild}>
        <Canvas
          key={direct ? "direct" : "post"}
          shadows="percentage"
          flat={!direct}
          frameloop={paused || lost ? "never" : policy.demand ? "demand" : "always"}
          dpr={[1, k.pixelRatio]}
          gl={{ antialias: direct, powerPreference: "high-performance" }}
          onCreated={onCreated}
        >
          <SceneContents frame={frame} extent={extent} demandCapMs={policy.demand ? policy.capMs : null} direct={direct} />
        </Canvas>
      </GlGuard>
      {lost && (
        <GlNotice
          title="The 3D view lost its graphics connection"
          text="This can happen when the computer sleeps or runs short of graphics memory. It usually comes back by itself. If it does not, rebuild the view."
          action="Rebuild the 3D view"
          onAction={rebuild}
        />
      )}
      {(view === "furniture" || view === "ha") && <EditOverlay view={view} />}
    </>
  );
}
