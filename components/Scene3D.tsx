"use client";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "@/lib/mathUtil";
import { Object3D, Vector3, type DirectionalLight, type HemisphereLight } from "three";
import { useKnobs, useQuality, reportRenderer, isLite } from "@/lib/quality";
import { framePolicy, frameFlags, type FramePolicy } from "@/lib/framePacer";
import { useVp } from "@/lib/useVp";
import { probe } from "./scene/devProbe";
import { planBounds } from "@/lib/geometry";
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
import { useSkySettings } from "@/lib/sky";
import CloudShadows from "./scene/CloudShadows";
import SkyDriver from "./scene/SkyDriver";
import NightSky from "./scene/NightSky";
import Weather from "./scene/Weather";
import AmbientLife from "./scene/AmbientLife";
import { live } from "./scene/skyLive";
import GardenGround from "./scene/GardenGround";
import PostFx, { Studio } from "./scene/PostFx";
import QualityGovernor from "./scene/QualityGovernor";
import FrameDriver from "./scene/FrameDriver";
import { GlGuard, GlNotice } from "./scene/GlStatus";
import { useFramePaused } from "./scene/useFramePaused";
import { useFrameWatchdog } from "./scene/useFrameWatchdog";
import HdriEnv from "./scene/HdriEnv";
import Rig from "./scene/Rig";
import SnapshotBridge from "./scene/SnapshotBridge";
import StudioFloor from "./scene/StudioFloor";
import EditOverlay from "./scene/edit/EditOverlay";
import FurnitureEditor3D from "./scene/edit/FurnitureEditor3D";
import SelectionPicker from "./scene/edit/SelectionPicker";
import Flows from "./scene/Flows";
import EnergyFlow from "./scene/EnergyFlow";
import PipesLayer from "./scene/PipesLayer";
import { useLiveLayer } from "@/lib/liveLayer";
import DeclutterLayer from "./scene/DeclutterLayer";
import { FacingDriver } from "./scene/facingState";
import ItemPulse from "./scene/ItemPulse";
import PresenceAvatars from "./scene/PresenceAvatars";
import AlertFx from "./scene/AlertFx";
import SunHeat from "./scene/SunHeat";
import FootprintHalo from "./scene/FootprintHalo";
import AnnotationPins from "./scene/AnnotationPins";
import MaintenanceMarkers from "./scene/MaintenanceMarkers";
import { useThemeColors } from "@/lib/useThemeColors";
import { STUDIO_BACKDROP } from "@/lib/studioLook";
import { useWalkActive } from "@/lib/walkStore";

const WalkRig = lazy(() => import("./scene/walk/WalkRig")); // the first-person camera: downloaded the first time somebody walks

const GARDEN_SHADOW_EXTENT = 32; // items on the lawn and drive cast and receive sun shadows this far (m) around the building centre
const STUDIO_SHADOW_MARGIN = 14; // metres of sun shadow beyond the building's corners on the studio ground
const WALK_ECO_DPR = 0.85; // Eco draws a walkthrough a little coarser: first person fills the whole screen with near surfaces, which costs more than the isometric view
const BACKDROP: Record<Environment, string> = { studio: STUDIO_BACKDROP, garden: "#0a0c11" };

/** How far the sun (directional, so only its shadow camera cares) stands from the flat: casters nearer to the sun than SUN_DISTANCE - 0.5 m (the shadow camera's near plane) cast a shadow, so it must reach past the neighbours that cast shadows (SiteBuildings SHADOW_M plus a block's depth). */
const SUN_DISTANCE = 60;
/** Eco and Light: the sun's shadow map is redrawn once the sun has moved this far (m^2, at SUN_DISTANCE: about a third of a degree), besides when the scene changed. */
const SUN_REDRAW_M2 = 0.1;
/** Eco: the sun's shadow map covers the building and this many metres around it. */
const TIGHT_SHADOW_MARGIN = 9;

const NO_ENV_FILL = 1.45;
/** Sun (moon at night) and fill follow the live sky: direction, colour and strength are written each frame, never through React. `onSun` hands the sun light to whoever needs its shadow map (the god rays). */
function Lighting({ cx, cz, extent, garden, onSun }: { cx: number; cz: number; extent: number; garden: boolean; onSun: (light: DirectionalLight | null) => void }) {
  const { shadowMap, shadowSoft, fx, studioEnv, shadows } = useKnobs();
  const lazy = fx !== "film"; // Eco and Light redraw the sun's shadow map only when something that casts a shadow may have changed (the camera alone never does); the film tiers redraw it every frame as always
  const gl = useThree((s) => s.gl);
  const radius = clamp((shadowSoft * shadowMap) / (2 * extent), 1, 12); // texels of filter for a constant soft edge in metres
  const target = useMemo(() => new Object3D(), []);
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight | null>(null);
  const sunRef = useCallback((light: DirectionalLight | null) => { sun.current = light; onSun(light); }, [onSun]);
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
        ref={sunRef}
        target={target}
        castShadow={shadows}
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
function SceneContents({ frame, extent, pace, direct }: { frame: Frame; extent: number; pace: FramePolicy | null; direct: boolean }) {
  const k = useKnobs();
  const plan = useStore((s) => s.plan);
  const environment = useStore((s) => s.environment);
  const view = useStore((s) => s.view);
  const powerLayer = useLiveLayer((s) => s.layer === "power"); // the power lines (energy flows) belong to the Power layer of the Live view
  const garden = environment === "garden";
  const [sun, setSun] = useState<DirectionalLight | null>(null); // the sun's light, once mounted (a new one replaces it when the shadow map is rebuilt)
  const surroundings = useSurroundings() !== null;
  const walking = useWalkActive(); // first person: the isometric view's floating labels are off and the walker's camera is mounted
  const themed = useThemeColors(); // the Studio's clear colour follows the HUD theme (read once per theme change); the garden's sky logic is untouched
  const backdrop = garden ? BACKDROP.garden : themed.sceneBackdrop;
  return (
    <>
      <color attach="background" args={[backdrop]} />
      <SkyDriver backdrop={backdrop} />
      {k.nightSky !== 0 && <NightSky level={k.nightSky} />}
      <QualityGovernor />
      {pace && <FrameDriver capMs={pace.capMs} ambientMs={pace.ambientMs} shadowMs={pace.shadowMs} />}
      <Rig />
      <FacingDriver />
      <SnapshotBridge />
      {walking ? <Suspense fallback={null}><WalkRig /></Suspense> : <DeclutterLayer />}
      <Lighting cx={frame.cx} cz={frame.cz} extent={extent} garden={garden} onSun={setSun} />
      {k.ibl ? <HdriEnv garden={garden} /> : k.studioEnv && <Studio />}
      <FoliageDriver />
      {garden ? (
        <>
          <GardenGround cx={frame.cx} cz={frame.cz} covered={surroundings} />
          <Surroundings />
          <Scatter plan={plan} />
          <SeasonGarden cx={frame.cx} cz={frame.cz} />
          {k.ambient && <CloudShadows cx={frame.cx} cz={frame.cz} />}
        </>
      ) : (
        <StudioFloor cx={frame.cx} cz={frame.cz} />
      )}
      <GroundAreas />
      <FootprintHalo />
      <Levels />
      <AnnotationPins />
      {!walking && <MaintenanceMarkers />}
      <group position-y={baseElevation(plan)}>
        <HolidayDecor />
      </group>
      <Weather cx={frame.cx} cz={frame.cz} half={frame.half} />
      {view === "live" && <AmbientLife />}
      {view === "furniture" && <FurnitureEditor3D />}
      {view === "ha" && <SelectionPicker />}
      {(view === "ha" || (view === "live" && powerLayer)) && <Flows interactive={view === "ha"} />}
      <EnergyFlow />
      <PipesLayer />
      <ItemPulse />
      {view === "live" && <PresenceAvatars />}
      <AlertFx />
      <SunHeat />
      {!direct && <PostFx sun={sun} />}
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
  const walking = useWalkActive();
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
          key={`${direct ? "direct" : "post"}-${k.antialias ? "aa" : "plain"}-${k.shadows ? "sh" : "flat"}`} // the multisampling is fixed when the GL context is made, and the shadow shaders when the materials compile: a change of either builds the canvas again
          shadows={k.shadows ? "percentage" : false}
          flat={!direct}
          frameloop={paused || lost ? "never" : policy.demand || walking ? "demand" : "always"} // a walker standing still draws nothing, whatever the tier
          dpr={k.pixelRatio < 1 ? k.pixelRatio : walking && isLite(tier) ? WALK_ECO_DPR : [1, k.pixelRatio]} // below 1 (software drawing) a fixed smaller render size; otherwise the screen's own ratio up to the tier's cap (Eco walks a little coarser)
          gl={{ antialias: direct && k.antialias, powerPreference: "high-performance" }}
          onCreated={onCreated}
        >
          <SceneContents frame={frame} extent={extent} pace={policy.demand || walking ? policy : null} direct={direct} />
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
