"use client";
import { SpeakerHighIcon } from "@phosphor-icons/react";
import { memo, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Color, type Group } from "three";
import { CATALOG, type Def } from "@/lib/catalog";
import { finishOf, carPresence } from "@/lib/cars";
import { critterPresence } from "@/lib/critters";
import { iconOf, mdiOf } from "@/lib/deviceIcons";
import { WALL_CUT_H } from "@/lib/geometry";
import { TOGGLEABLE, domainOf } from "@/lib/ha";
import { lightInfo } from "@/lib/light";
import { plateOf } from "@/lib/plate";
import { usePlateEdit } from "@/lib/plateEditState";
import { itemPlateFits } from "@/lib/plateFit";
import { useKnobs } from "@/lib/quality";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { isVacuumKind } from "@/lib/vacuumPath";
import { iconComponent } from "./../ui/deviceIcons";
import { useItemIcon } from "./../ui/useItemIcon";
import { domainIcon } from "./../ui/domainIcon";
import DeviceGlyph from "../ui/DeviceGlyph";
import Barometer from "./Barometer";
import CameraFov from "./CameraFov";
import CarMesh from "./CarMesh";
import { Marker as DeviceMarker } from "./DeclutterLayer";
import Critter from "./Critter";
import { HeatFx, ItemBadge, LampLight, useFloorPool } from "./ItemExtras";
import { deviceDrive } from "./itemDrive";
import { useDeviceGesture } from "./itemGesture";
import { useItemMotion } from "./itemMotion";
import { ItemParts, usePartDraw } from "./itemParts";
import { itemPointerProps } from "./itemPointer";
import { useIsoItemGone, useIsoSink, useIsoZone } from "./isoState";
import { useCutaway } from "./levelState";
import { useAutoCut, useSquash, useWallPieceCut } from "./facingState";
import { useModelNode } from "./ModelMesh";
import { useReducedMotion } from "./motion";
import { emitsLight, lampRank, pointShadowIds } from "./pointShadow";
import SceneHtml from "./SceneHtml";
import { useOutOfSeason } from "./SeasonalFx";
import SensorFx, { RunFx, SensorStub } from "./SensorFx";
import { useItemFrame } from "./useItemFrame";
import { useItemLive } from "./useItemLive";
import Vacuum from "./Vacuum";
import WashFx from "./WashFx";

const DEG = Math.PI / 180;
const WALL_CAP = "#23262e"; // same dark top as the cut-away walls
const APPLIANCE_WHITE = "#dff0ff";

/** Whether this lamp gets a real point light (only the first few lamps do: every light costs every lit pixel) and whether that light casts a shadow. */
function useLampLight(item: Item, emits: boolean, pointLights: number, pointShadows: boolean) {
  const rank = useStore((s) => lampRank(s.plan.items, item.id));
  const litPoint = emits && rank < pointLights; // a real light only for the first few lamps (the rest still glow and paint a pool on the floor)
  const shadowed = useStore((s) => pointShadowIds(s.plan.items).has(item.id));
  return { litPoint, castsPoint: litPoint && pointShadows && shadowed };
}

/** A solid building part (column, riser) cut down like the walls in cut-away view: a dark cap on top. */
function CutCap({ item, def, y }: { item: Item; def: Def; y: number }) {
  const round = def.parts[0]?.shape === "cyl";
  return (
    <mesh position={[0, y + WALL_CUT_H + 0.003, 0]} castShadow>
      {round ? <cylinderGeometry args={[item.w / 2, item.w / 2, 0.006, 24]} /> : <boxGeometry args={[item.w, 0.006, item.d]} />}
      <meshStandardMaterial color={WALL_CAP} roughness={0.7} />
    </mesh>
  );
}

function ItemInner({ item, def, cut, rootRef }: { item: Item; def: Def; cut: boolean; rootRef?: RefObject<Group | null> }) {
  const st = useStore((s) => (item.entity ? s.states[item.entity] : undefined));
  const lv = useItemLive(item); // a sensor reading, or the run state of an appliance on a smart plug (useItemLive.ts)
  const mdi = useItemIcon(item); // a Material Design icon: the owner's pick, or Home Assistant's own for the entity (Display > Device icons)
  const edit = useStore((s) => s.view !== "live"); // editing views never toggle devices and carry no state badges
  const toggle = useStore((s) => s.toggle);
  const knobs = useKnobs();
  const reduced = useReducedMotion();
  const domain = item.entity ? domainOf(item.entity) : undefined;
  const canToggle = !!domain && TOGGLEABLE.includes(domain);
  const echo = item.kind === "echo_dot";
  const emits = emitsLight(item.entity, def, item.kind); // only real light fixtures cast a pool and a point light; other appliances just light their glow parts
  const { litPoint, castsPoint } = useLampLight(item, emits, knobs.pointLights, knobs.pointShadows);
  const elev = item.elev ?? 0;
  const isCamera = domain === "camera" || /^sec_(cam|doorbell)/.test(item.kind);
  const presence = carPresence(item.kind, item.entity, st?.state) ?? critterPresence(item.kind, item.entity, st?.state); // cars: headlights glow at home, ghost when away; animals with a pet tracker: ghost when away
  const away = presence === "away";
  const info = lightInfo(st, def.light?.color ?? (emits ? "#ffd9a0" : APPLIANCE_WHITE));
  const drive = deviceDrive({ item, def, st, lv, presence, domain, echo });
  const lit = emits ? info.on : drive.level0 > 0;
  const tint = useMemo(() => new Color(lv.sensor?.color ?? "#ffffff"), [lv.sensor?.color]);
  const motion = useItemMotion(item, def, st);
  const gesture = useDeviceGesture(item.entity);
  const model = useModelNode(def, item.kind);
  const draw = usePartDraw(def, item, knobs, away, motion.fx, !!model.node);
  const frame = useItemFrame({ item, def, edit, reduced, echo, thermo: drive.thermo, heating: drive.heating, media: drive.media, sec: drive.sec, state: st?.state, lv, tint, motion, targetLevel: emits ? info.level : drive.sec ? drive.sec.level : drive.level0, rgb: info.rgb });
  const { drop, clips } = useFloorPool(item);
  const plateEditing = usePlateEdit((s) => (s.editing?.id === item.id ? s.editing.end : null)); // the plate the inspector is adjusting on this car, outlined

  const lightY = ((def.light?.y ?? def.h * 0.8) * item.h) / def.h + elev;
  const cutK = cut && item.h > WALL_CUT_H ? WALL_CUT_H / item.h : 1; // solid building parts (columns, risers) are cut down like the walls in cut-away view
  const label = st?.attributes.friendly_name ?? item.entity;
  const pointer = edit ? {} : itemPointerProps({ item, domain, lv, gesture, canToggle, curtainCard: motion.curtainCard, openCurtain: motion.openCurtain, toggle });

  return (
    <group ref={rootRef} name={`item:${item.id}`} position={[item.x, drop, item.y]} rotation={[0, -item.rot * DEG, 0]} {...pointer}>
      <group ref={frame.body} position={[0, elev, 0]} scale={[item.w / def.w, (item.h * cutK) / def.h, item.d / def.d]}>
        {!model.node && def.car && <CarMesh spec={def.car} color={item.color} finish={finishOf(item.params, item.color ?? def.car.color)} level={frame.level} ghost={away} plate={plateOf(item.params)} fits={itemPlateFits(item.params)} editing={plateEditing} />}
        <ItemParts item={item} def={def} knobs={knobs} away={away} emits={emits} fx={motion.fx} frame={frame} draw={draw} />
        {!model.node && item.kind === "sn_barometer" && <Barometer state={st} edit={edit} />}
        {model.node}
      </group>
      {!model.node && def.critter && <Critter item={item} def={def} ghost={away} edit={edit} elev={elev} />}
      {model.missing && (
        <SceneHtml position={[0, Math.min(item.h + elev, 2.4) + 0.3, 0]}>
          <div className="badge" style={{ whiteSpace: "pre-line", textAlign: "center", lineHeight: 1.35 }}>{model.missing}</div>
        </SceneHtml>
      )}
      {cutK < 1 && <CutCap item={item} def={def} y={elev} />}
      {drive.heater && <HeatFx item={item} elev={elev} heat={frame.heat} />}
      {emits && <LampLight frame={frame} clips={clips} litPoint={litPoint} castsPoint={castsPoint} lightY={lightY} />}
      {!edit && lv.sensor && <SensorFx item={item} def={def} elev={elev} info={lv.sensor} />}
      {!edit && lv.run && <RunFx item={item} elev={elev} run={lv.run} />}
      {!edit && lv.wash && <WashFx item={item} elev={elev} wash={lv.wash} />}
      {away && (
        <DeviceMarker id={`${item.id}:away`} kind="badge" position={[0, item.h + elev + 0.3, 0]} label={`${label}: away`}>
          <div className="badge">away</div>
        </DeviceMarker>
      )}
      {st && !edit && !lv.sensor && !lv.wash && !away && (
        <ItemBadge item={item} st={st} label={label} y={Math.min(item.h * cutK + elev, 2.4) + 0.3} canToggle={canToggle} isCamera={isCamera} lit={lit} rgb={info.rgb} Icon={iconComponent(iconOf(item.params)) ?? (echo ? SpeakerHighIcon : domainIcon(domain))} mdi={mdi} gesture={gesture} openCurtain={motion.curtainCard ? motion.openCurtain : null} toggle={toggle} />
      )}
      {!st && !edit && !lv.sensor && !lv.wash && (mdiOf(item.params) || iconOf(item.params)) && (
        <DeviceMarker id={`${item.id}:saved-icon`} kind="badge" position={[0, Math.min(item.h * cutK + elev, 2.4) + 0.3, 0]} label={def.label}>
          <span className="badge" data-saved-device-icon={item.id}><DeviceGlyph item={item} /></span>
        </DeviceMarker>
      )}
    </group>
  );
}

/**
 * A pillar (column, riser) is part of the building shell, so it is lowered like the walls: always with Cut-away on, and with it off while the pillar stands on the camera's
 * side of the building (lib/wallFacing.ts). Same mesh, scaled from the floor (no geometry rebuilt), eased like the walls; the dark cap sits at the cut height once it is low.
 */
function PillarSquash({ item, def, low, children }: { item: Item; def: Def; low: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const lowered = low && item.h > WALL_CUT_H;
  useSquash(ref, lowered ? WALL_CUT_H / item.h : 1);
  return (
    <>
      <group ref={ref} name={`pillar:${item.id}`}>{children}</group>
      {lowered && (
        <group position={[item.x, 0, item.y]} rotation={[0, -item.rot * DEG, 0]}>
          <CutCap item={item} def={def} y={item.elev ?? 0} />
        </group>
      )}
    </>
  );
}

/** Memoised: dragging one piece in the furniture editor patches only that item, so the others keep their object identity and skip rendering. */
export default memo(function ItemMesh({ item }: { item: Item }) {
  const cutaway = useCutaway();
  const edit = useStore((s) => s.view !== "live"); // the editing views show wall-mounted pieces too, so they can be picked
  const def = CATALOG[item.kind];
  const outOfSeason = useOutOfSeason(item.kind, !edit && item.params?.seasonal === true); // opt-in: hide a holiday piece outside its holiday window (live view only)
  const root = useRef<Group>(null); // the item's root group: Vacuum moves a robot vacuum along its route through it
  const iso = useIsoZone(); // Room mode: other rooms' furniture sinks away; the isolated room's wall pieces all show, so every device in it can be seen and touched
  const rooms = useRef<Group>(null);
  useIsoSink(rooms, useIsoItemGone(item.id), !!def && emitsLight(item.entity, def, item.kind)); // a lamp's group stays in the scene (flat): a hidden light would recompile every material
  const wallCut = useWallPieceCut(item, !!def?.wall); // Cut-away off: a piece hangs on its wall, so it goes while that wall is cut
  const pillarCut = useAutoCut(def?.pillar ? item.id : undefined) === "cut"; // Cut-away off: a pillar on the camera's side of the building is lowered
  if (!def || outOfSeason) return null;
  if ((cutaway || wallCut) && def.wall && !edit && !iso) return def.cat === "Sensors" ? <SensorStub item={item} /> : null; // the wall's piece goes with the wall; a sensor keeps its badge
  // stairs stay whole (you need to see where they lead); other solid parts are cut down with Cut-away on; pillars ease in PillarSquash instead
  const inner = <ItemInner item={item} def={def} cut={cutaway && !!def.solid && !def.stair && !def.pillar} rootRef={root} />;
  return (
    <group ref={rooms}>
      {def.pillar ? <PillarSquash item={item} def={def} low={cutaway || pillarCut}>{inner}</PillarSquash> : inner}
      {isVacuumKind(item.kind) && <Vacuum item={item} root={root} />}
      {/^sec_(cam|doorbell)/.test(item.kind) && <CameraFov item={item} />}
    </group>
  );
});
