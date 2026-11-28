"use client";
import {
  ArmchairIcon, ArrowClockwiseIcon, ArrowCounterClockwiseIcon, ArrowUUpLeftIcon, ArrowUUpRightIcon, BuildingsIcon, ChartLineIcon, CopyIcon, CursorIcon, DatabaseIcon, DownloadSimpleIcon, FilePlusIcon, FlowArrowIcon,
  GlobeHemisphereEastIcon, LightningIcon, ListMagnifyingGlassIcon, LockSimpleIcon, LockSimpleOpenIcon, MapTrifoldIcon, PaintBucketIcon, SlidersHorizontalIcon, StackIcon, TelevisionIcon, ThermometerIcon, TrashIcon, UploadSimpleIcon,
} from "@phosphor-icons/react";
import { ImageSquareIcon, SunHorizonIcon } from "@phosphor-icons/react";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { SparkleIcon } from "@phosphor-icons/react";
import { LightbulbFilamentIcon } from "@phosphor-icons/react";
import { useRoutinesUi } from "./routinesUi";
import MaintenanceButton from "./MaintenanceButton";
import { useSkyChartUi } from "./skyChartUi";
import { useHealthUi } from "./healthUi";
import { useAdvisorUi } from "./advisorUi";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { ShareNetworkIcon } from "@phosphor-icons/react";
import { PersonSimpleWalkIcon } from "@phosphor-icons/react";
import { walkHere } from "@/lib/walkStore";
import { useShareUi } from "./shareUi";
import { toggleReplay, useReplay } from "@/lib/replay";
import { RowsCtx } from "./rowsCtx";
import { useContext } from "react";
import { starterPlan, useStore } from "@/lib/store";
import { selectStates } from "@/lib/statesMerge";
import { useEditUi } from "../scene/edit/editStore";
import { useFlowUi } from "../scene/edit/flowUi";
import { duplicateItem, once, toggleLock, turnItem } from "../scene/edit/itemOps";
import { useEnergyUi } from "./energyUi";
import { Equaliser } from "./MediaBits";
import { useMediaUi } from "./mediaUi";
import { DockButton, PaletteButton, Sep, TOOLS } from "./DockParts";
import { exportPlan } from "./planIO";

const anyMediaPlaying = selectStates((states) => Object.values(states).some((e) => e.entity_id.startsWith("media_player.") && (e.state === "playing" || e.state === "buffering")));

/** Which dock panels are open, and the handlers that toggle them. */
export type DockPanels = {
  catalog: boolean; onCatalog: () => void;
  browser: boolean; onBrowser: () => void; onAreas: () => void;
  climate: boolean; onClimate: () => void;
  stats: boolean; onStats: () => void;
  /** undefined = no TV in the plan: no button */
  plex?: boolean; onPlex: () => void;
  building: boolean; onBuilding: () => void;
  newPlan: boolean; onNewPlan: () => void;
  site: boolean; onSite: () => void;
  daylight: boolean; onDaylight: () => void;
  trace: boolean; onTrace: () => void;
  data: boolean; onData: () => void;
  graphics: boolean; onGraphics: () => void;
  plans: boolean; onPlans: () => void;
  scenes: boolean; onScenes: () => void;
};

function History({ mod }: { mod: string }) {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  return (
    <>
      <DockButton label="Undo" shortcut={`${mod} Z`} stay disabled={!canUndo} onClick={undo}><ArrowUUpLeftIcon size={18} /></DockButton>
      <DockButton label="Redo" shortcut={`${mod} SHIFT Z`} stay disabled={!canRedo} onClick={redo}><ArrowUUpRightIcon size={18} /></DockButton>
    </>
  );
}

export function LiveActions({ browser, onBrowser, climate, onClimate, plex, onPlex, stats, onStats, daylight, onDaylight, scenes, onScenes }: DockPanels) {
  const energyOpen = useEnergyUi((s) => s.open);
  const replayOpen = useReplay((s) => s.open);
  const inMenu = useContext(RowsCtx) !== null; // the compact menu lists History in its Scene section instead
  const mediaOpen = useMediaUi((s) => s.open);
  const mediaPlaying = useStore(anyMediaPlaying);
  const routinesOpen = useRoutinesUi((s) => s.open);
  const skyOpen = useSkyChartUi((s) => s.open);
  const healthOpen = useHealthUi((s) => s.open);
  const advisorOpen = useAdvisorUi((s) => s.open);
  return (
    <>
      <DockButton label="Entities" dev shortcut="E" active={browser} onClick={onBrowser}><ListMagnifyingGlassIcon size={18} /></DockButton>
      <DockButton label="Climate" shortcut="H" active={climate} onClick={onClimate}><ThermometerIcon size={18} /></DockButton>
      {plex !== undefined && <DockButton label="Plex / Bedroom TV" text="TV" shortcut="P" active={plex} onClick={onPlex}><TelevisionIcon size={18} /></DockButton>}
      <DockButton label="Statistics" shortcut="S" active={stats} onClick={onStats}><ChartLineIcon size={18} /></DockButton>
      <DockButton label="Scenes" active={scenes} onClick={onScenes}><SparkleIcon size={18} /></DockButton>
      <DockButton label="Routines" active={routinesOpen} onClick={() => useRoutinesUi.getState().show()}><LightbulbFilamentIcon size={18} /></DockButton>
      <DockButton label="Home health" active={healthOpen} onClick={() => useHealthUi.getState().show()}><HeartbeatIcon size={18} /></DockButton>
      <DockButton label="Advisor" active={advisorOpen} onClick={() => useAdvisorUi.getState().show()}><LightbulbFilamentIcon size={18} /></DockButton>
      <DockButton label="Media" shortcut="M" active={mediaOpen} onClick={() => useMediaUi.getState().toggle()}><Equaliser playing={mediaPlaying} /></DockButton>
      <DockButton label="Energy" shortcut="N" active={energyOpen} onClick={() => useEnergyUi.getState().toggle()}><LightningIcon size={18} /></DockButton>
      {!inMenu && <DockButton label="History" shortcut="Y" active={replayOpen} onClick={toggleReplay}><ClockCounterClockwiseIcon size={18} /></DockButton>}
      <DockButton label="Sunlight in this room" text="Sunlight" active={daylight} onClick={onDaylight}><SunHorizonIcon size={18} /></DockButton>
      <DockButton label="Night sky" active={skyOpen} onClick={() => useSkyChartUi.getState().show()}><SparkleIcon size={18} /></DockButton>
      <DockButton label="Walk through the home" text="Walk" onClick={() => walkHere()}><PersonSimpleWalkIcon size={18} /></DockButton>
    </>
  );
}

export function PlanActions({ mod, building, onBuilding, site, onSite, daylight, onDaylight, trace, onTrace, newPlan, onNewPlan, onImport }: Pick<DockPanels, "building" | "onBuilding" | "site" | "onSite" | "daylight" | "onDaylight" | "trace" | "onTrace" | "newPlan" | "onNewPlan"> & { mod: string; onImport: () => void }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const setPlan = useStore((s) => s.setPlan);
  return (
    <>
      {TOOLS.map((t, i) => (
        <DockButton key={t.tool} label={t.label} shortcut={i < 9 ? String(i + 1) : undefined} active={tool === t.tool} onClick={() => setTool(t.tool)}>{t.icon}</DockButton>
      ))}
      <Sep />
      <History mod={mod} />
      <Sep />
      <DockButton label="Building and levels" text="Building" active={building} onClick={onBuilding}><BuildingsIcon size={18} /></DockButton>
      <DockButton label="Surroundings" active={site} onClick={onSite}><GlobeHemisphereEastIcon size={18} /></DockButton>
      <DockButton label="Sunlight in this room" text="Sunlight" active={daylight} onClick={onDaylight}><SunHorizonIcon size={18} /></DockButton>
      <DockButton label="Floor plan image to trace over" text="Trace image" active={trace} onClick={onTrace}><ImageSquareIcon size={18} /></DockButton>
      <Sep />
      <DockButton label="Start from a template" text="Templates" active={newPlan} onClick={onNewPlan}><FilePlusIcon size={18} /></DockButton>
      <DockButton label="Export plan" onClick={() => exportPlan(useStore.getState().plan)}><DownloadSimpleIcon size={18} /></DockButton>
      <DockButton label="Import plan" onClick={onImport}><UploadSimpleIcon size={18} /></DockButton>
      <DockButton label="Reset to starter" onClick={() => confirm("Replace the plan with the starter house?") && setPlan(starterPlan())}><ArrowCounterClockwiseIcon size={18} /></DockButton>
    </>
  );
}

export function FurnitureActions({ mod, catalog, onCatalog }: Pick<DockPanels, "catalog" | "onCatalog"> & { mod: string }) {
  const tool = useStore((s) => s.tool);
  const sel = useStore((s) => s.sel);
  const setTool = useStore((s) => s.setTool);
  const passThrough = useEditUi((s) => s.passThrough);
  const selected = useStore((s) => {
    const sel = s.sel;
    return sel?.type === "item" ? s.plan.items.find((i) => i.id === sel.id) : undefined;
  });
  const itemSelected = sel?.type === "item";
  return (
    <>
      <DockButton label="Select and move" text="Select" active={tool === "select" && !catalog} onClick={() => { setTool("select"); if (catalog) onCatalog(); }}><CursorIcon size={18} /></DockButton>
      <DockButton label="Catalog" shortcut="F" active={catalog || tool.startsWith("add:")} onClick={onCatalog}><ArmchairIcon size={18} /></DockButton>
      <DockButton label="Paint" shortcut="B" active={tool === "paint"} onClick={() => setTool(tool === "paint" ? "select" : "paint")}><PaintBucketIcon size={18} /></DockButton>
      <Sep />
      <DockButton label="Duplicate" stay disabled={!itemSelected} onClick={() => selected && duplicateItem(selected)}><CopyIcon size={18} /></DockButton>
      <DockButton label="Rotate 90 degrees" text="Rotate" shortcut="R" stay disabled={!itemSelected || !!selected?.locked} onClick={() => sel && turnItem(sel.id, 90)}><ArrowClockwiseIcon size={18} /></DockButton>
      <DockButton label={selected?.locked ? "Unlock" : "Lock in place"} text={selected?.locked ? "Unlock" : "Lock"} stay active={!!selected?.locked} disabled={!itemSelected} onClick={() => sel && toggleLock(sel.id)}>{selected?.locked ? <LockSimpleIcon size={18} /> : <LockSimpleOpenIcon size={18} />}</DockButton>
      <DockButton label="Delete" shortcut="DEL" disabled={!itemSelected} onClick={() => sel && once(() => useStore.getState().remove("item", sel.id))}><TrashIcon size={18} /></DockButton>
      <Sep />
      <DockButton label="Pick through: a click selects what is behind" text="Pick through" stay active={passThrough} onClick={() => useEditUi.getState().set({ passThrough: !passThrough })}><StackIcon size={18} /></DockButton>
      <Sep />
      <History mod={mod} />
    </>
  );
}

export function HaActions({ browser, onBrowser, onAreas }: Pick<DockPanels, "browser" | "onBrowser" | "onAreas">) {
  const flowOn = useFlowUi((s) => s.on);
  const toggleConnect = () => { useFlowUi.getState().setOn(!flowOn); useStore.getState().select(null); };
  return (
    <>
      <DockButton label="Entities" dev shortcut="E" active={browser} onClick={onBrowser}><ListMagnifyingGlassIcon size={18} /></DockButton>
      <DockButton label="Map areas to rooms" text="Map areas" onClick={onAreas}><MapTrifoldIcon size={18} /></DockButton>
      <DockButton label="Connect energy" active={flowOn} onClick={toggleConnect}><FlowArrowIcon size={18} /></DockButton>
    </>
  );
}

/** Plans, data, graphics and the palette: the settings end of the dock (its own group in the compact menu). */
export function SettingsActions({ mod, plans, onPlans, data, onData, graphics, onGraphics, onPalette }: Pick<DockPanels, "plans" | "onPlans" | "data" | "onData" | "graphics" | "onGraphics"> & { mod: string; onPalette: () => void }) {
  return (
    <>
      <DockButton label="Your plans" text="Plans" active={plans} onClick={onPlans}><StackIcon size={18} /></DockButton>
      <MaintenanceButton />
      <DockButton label="Data and backups" text="Data" active={data} onClick={onData}><DatabaseIcon size={18} /></DockButton>
      <DockButton label="Share a picture, a video or a read-only link" text="Share" onClick={() => useShareUi.getState().show()}><ShareNetworkIcon size={18} /></DockButton>
      <DockButton label="Graphics quality" text="Graphics" active={graphics} onClick={onGraphics}><SlidersHorizontalIcon size={18} /></DockButton>
      <PaletteButton mod={mod} onClick={onPalette} />
    </>
  );
}
