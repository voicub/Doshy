"use client";
import {
  ArmchairIcon, ArrowCounterClockwiseIcon, ArrowUUpLeftIcon, ArrowUUpRightIcon, BuildingsIcon, CheckIcon, CursorIcon, DownloadSimpleIcon, FilePlusIcon, FlowArrowIcon, GlobeHemisphereEastIcon,
  ListMagnifyingGlassIcon, MapTrifoldIcon, PaintBucketIcon, SlidersHorizontalIcon, StackIcon, UploadSimpleIcon, XIcon, ArrowClockwiseIcon, type Icon,
} from "@phosphor-icons/react";
import { ImageSquareIcon, SunHorizonIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { CATALOG } from "@/lib/catalog";
import { touchHint } from "@/lib/editHints";
import { errorMessage } from "@/lib/guards";
import { starterPlan, useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import { useEditUi } from "./scene/edit/editStore";
import { useFreeArea } from "./scene/edit/useFreeArea";
import { useFlowUi } from "./scene/edit/flowUi";
import { pickBridge } from "./scene/edit/pickBridge";
import QuickToolbar from "./scene/edit/QuickToolbar";
import { TOOLS } from "./ui/Dock";
import { exportPlan, readPlanFile } from "./ui/planIO";
import "./compactEditors.css";

type Props = {
  catalog: boolean; onCatalog: () => void;
  browser: boolean; onBrowser: () => void; onAreas: () => void;
  building: boolean; onBuilding: () => void;
  site: boolean; onSite: () => void;
  daylight: boolean; onDaylight: () => void;
  trace: boolean; onTrace: () => void;
  newPlan: boolean; onNewPlan: () => void;
  /** Whether a left-hand panel (entities, building, ...) is open, and how to close all of them. */
  left: boolean; onCloseLeft: () => void;
};

/** One finger-sized button of the strip: icon only, the label appears on the active one. */
function Btn({ label, icon: I, active, disabled, primary, danger, onClick }: { label: string; icon: Icon; active?: boolean; disabled?: boolean; primary?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`es-btn${primary ? " es-primary" : ""}${danger ? " es-danger" : ""}`} aria-pressed={active} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <I size={22} aria-hidden />
      {(active || primary) && <span>{label}</span>}
    </button>
  );
}

/** The window size in css px (the stage fills the screen). */
function useWindowSize() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight });
    on();
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return size;
}

/** Plan mode only: the "Done" that finishes a wall or a garden line (no Esc key on a touchscreen). */
function PlanDone() {
  const tool = useStore((s) => s.tool);
  if (tool !== "wall" && tool !== "lines" && tool !== "ruler" && tool !== "annotate") return null;
  return <Btn label="Done" icon={CheckIcon} primary onClick={() => window.dispatchEvent(new CustomEvent("housey:finish-draw"))} />;
}

/** Placing a piece from the catalog with a finger: the piece waits as a ghost, a tap on the floor moves it, Place puts it down. */
function PlaceBar() {
  const tool = useStore((s) => s.tool);
  const ghost = useEditUi((s) => s.ghost);
  const stop = () => {
    useStore.getState().setTool("select");
    useEditUi.getState().set({ ghost: null, placeRot: 0 });
  };
  const turn = () => {
    const ui = useEditUi.getState();
    const placeRot = (ui.placeRot + 90) % 360;
    ui.set({ placeRot, ghost: ui.ghost && { ...ui.ghost, rot: placeRot } });
  };
  return (
    <>
      <Btn label="Cancel" icon={XIcon} onClick={stop} />
      <Btn label="Turn" icon={ArrowClockwiseIcon} onClick={turn} />
      <Btn label={ghost?.blocked ? "Place nearby" : "Place"} icon={CheckIcon} primary disabled={!ghost} onClick={() => pickBridge.confirmPlace?.()} />
      <span className="es-what">{CATALOG[tool.slice(4)]?.label}</span>
    </>
  );
}

/** Plan mode: file actions at the end of the scrolling row. */
function PlanFiles() {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const setPlan = useStore((s) => s.setPlan);
  const importPlan = async (f: File) => {
    try {
      let note: string | null = null; // why the plan opened without its floor plan picture, if it did
      setPlan(await readPlanFile(f, (n) => (note = n)));
      setError(note);
    } catch (e) {
      setError(`Invalid plan file: ${errorMessage(e)}`);
    }
  };
  return (
    <>
      <Btn label="Export plan" icon={DownloadSimpleIcon} onClick={() => exportPlan(useStore.getState().plan)} />
      <Btn label="Import plan" icon={UploadSimpleIcon} onClick={() => file.current?.click()} />
      <Btn label="Reset to starter" icon={ArrowCounterClockwiseIcon} onClick={() => confirm("Replace the plan with the starter house?") && setPlan(starterPlan())} />
      <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importPlan(f); }} />
      {error && <span className="es-error" role="alert">{error}</span>}
    </>
  );
}

/** Plan mode's tools: the drawing tools, then building, surroundings, new plan and the file actions. */
function PlanTools({ building, onBuilding, site, onSite, daylight, onDaylight, trace, onTrace, newPlan, onNewPlan }: Pick<Props, "building" | "onBuilding" | "site" | "onSite" | "daylight" | "onDaylight" | "trace" | "onTrace" | "newPlan" | "onNewPlan">) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <>
      {TOOLS.map((t) => (
        <button key={t.tool} type="button" className="es-btn" aria-pressed={tool === t.tool} aria-label={t.label} title={t.label} onClick={() => setTool(t.tool)}>
          <span className="es-ico" aria-hidden>{t.icon}</span>
          {tool === t.tool && <span>{t.label}</span>}
        </button>
      ))}
      <PlanDone />
      <i className="es-sep" aria-hidden />
      <Btn label="Building and levels" icon={BuildingsIcon} active={building} onClick={onBuilding} />
      <Btn label="Surroundings" icon={GlobeHemisphereEastIcon} active={site} onClick={onSite} />
      <Btn label="Sunlight" icon={SunHorizonIcon} active={daylight} onClick={onDaylight} />
      <Btn label="Trace image" icon={ImageSquareIcon} active={trace} onClick={onTrace} />
      <Btn label="Templates" icon={FilePlusIcon} active={newPlan} onClick={onNewPlan} />
      <PlanFiles />
    </>
  );
}

/** Home Assistant mode's tools. */
function HaTools({ browser, onBrowser, onAreas }: Pick<Props, "browser" | "onBrowser" | "onAreas">) {
  const connect = useFlowUi((s) => s.on);
  return (
    <>
      <Btn label="Entities" icon={ListMagnifyingGlassIcon} active={browser} onClick={onBrowser} />
      <Btn label="Map areas to rooms" icon={MapTrifoldIcon} onClick={onAreas} />
      <Btn label="Connect energy" icon={FlowArrowIcon} active={connect} onClick={() => { useFlowUi.getState().setOn(!connect); useStore.getState().select(null); }} />
    </>
  );
}

/** Furniture mode's tools when nothing is selected or being placed. */
function FurnitureTools({ catalog, onCatalog }: Pick<Props, "catalog" | "onCatalog">) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const pass = useEditUi((s) => s.passThrough);
  return (
    <>
      <Btn label="Select and move" icon={CursorIcon} active={tool === "select" && !catalog} onClick={() => { setTool("select"); if (catalog) onCatalog(); }} />
      <Btn label="Catalog" icon={ArmchairIcon} active={catalog} onClick={onCatalog} />
      <Btn label="Paint" icon={PaintBucketIcon} active={tool === "paint"} onClick={() => setTool(tool === "paint" ? "select" : "paint")} />
      <Btn label="Pick through" icon={StackIcon} active={pass} onClick={() => useEditUi.getState().set({ passThrough: !pass })} />
    </>
  );
}

/** The bars above the dock reserve their height for the sheets and the 3D view (--tools-h on <html>). */
function useToolsHeight(ref: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--tools-h", `${ref.current?.offsetHeight ?? 0}px`);
    set();
    const ro = new ResizeObserver(set);
    if (ref.current) ro.observe(ref.current);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--tools-h");
    };
  }, [on, ref]);
}

type PanelRules = { on: boolean; catalog: boolean; left: boolean; onCloseLeft: () => void };

/** One panel at a time: a tap on another piece hides the inspector; opening a left panel or the catalog closes it (and the tool panels). */
function useOnePanelRules({ on, catalog, left, onCloseLeft }: PanelRules) {
  const view = useStore((s) => s.view);
  const tool = useStore((s) => s.tool);
  const sel = useStore((s) => s.sel);
  const inspectorOpen = useEditUi((s) => s.inspectorOpen);
  useEffect(() => {
    if (on) useEditUi.getState().set({ inspectorOpen: false });
  }, [on, sel?.type, sel?.id, view]);
  const autoPanel = tool === "paint" || ((tool === "garden" || tool === "lines") && view === "plan");
  const inspectorShown = !!sel && (view === "ha" || inspectorOpen);
  useEffect(() => {
    if (!on || !(catalog || left)) return;
    const s = useStore.getState();
    useEditUi.getState().set({ inspectorOpen: false });
    if (s.view === "ha") s.select(null);
    if (autoPanel) s.setTool("select");
  }, [on, catalog, left, autoPanel]);
  useEffect(() => {
    if (on && (inspectorShown || autoPanel) && (catalog || left)) onCloseLeft();
  }, [on, inspectorShown, autoPanel, catalog, left, onCloseLeft]);
}

/**
 * Compact screens (data-vp tiny and small): the editing tools of Plan, Furniture and Home Assistant mode as ONE row above the dock. Undo and redo stay pinned at the left, "Edit" (the inspector sheet) at the right,
 * the tools scroll in between. In the furniture view a selected piece's quick buttons (turn, lift, lock, copy, delete) take the middle; placing a piece shows Cancel / Turn / Place.
 * Also draws the one-line hint above the row. Renders nothing on the regular desktop layout and in Live mode.
 */
export default function EditStrip(p: Props) {
  const { vp } = useVp();
  const view = useStore((s) => s.view);
  const tool = useStore((s) => s.tool);
  const sel = useStore((s) => s.sel);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const placing = tool.startsWith("add:");
  const itemSel = useStore((s) => view === "furniture" && s.sel?.type === "item");
  const gesture = useEditUi((s) => s.gesture);
  const pass = useEditUi((s) => s.passThrough);
  const connect = useFlowUi((s) => s.on);
  const inspectorOpen = useEditUi((s) => s.inspectorOpen);
  const ref = useRef<HTMLElement>(null);
  const on = vp !== "regular" && view !== "live";
  const win = useWindowSize();
  const { free } = useFreeArea(win.w, win.h);
  useToolsHeight(ref, on);
  useOnePanelRules({ on, catalog: p.catalog, left: p.left, onCloseLeft: p.onCloseLeft });

  if (!on) return null;
  const editable = !!sel && view !== "ha" && !placing && tool === "select";
  const quick = itemSel && tool === "select";
  const text = touchHint({ view, tool, placingLabel: placing ? CATALOG[tool.slice(4)]?.label : undefined, selected: !!sel, gesture: gesture?.mode ?? null, connect, passThrough: pass });
  const middle: ReactNode =
    view === "plan" ? <PlanTools building={p.building} onBuilding={p.onBuilding} site={p.site} onSite={p.onSite} daylight={p.daylight} onDaylight={p.onDaylight} trace={p.trace} onTrace={p.onTrace} newPlan={p.newPlan} onNewPlan={p.onNewPlan} />
    : view === "ha" ? <HaTools browser={p.browser} onBrowser={p.onBrowser} onAreas={p.onAreas} />
    : placing ? <PlaceBar />
    : quick ? <QuickToolbar docked />
    : <FurnitureTools catalog={p.catalog} onCatalog={p.onCatalog} />;

  return (
    <>
      <p className="es-hint hud" role="status" style={{ left: free.x0 + 8, bottom: win.h - free.y1 + 8, maxWidth: Math.max(120, free.x1 - free.x0 - 16) }}>
        {text}
      </p>
      <nav ref={ref} className="edit-strip hud" aria-label="Editing tools">
        <div className="es-pin">
          <Btn label="Undo" icon={ArrowUUpLeftIcon} disabled={!canUndo} onClick={() => useStore.getState().undo()} />
          <Btn label="Redo" icon={ArrowUUpRightIcon} disabled={!canRedo} onClick={() => useStore.getState().redo()} />
        </div>
        <div key={`${view}:${placing ? "place" : quick ? "quick" : tool}`} className="es-scroll">{middle}</div>
        {editable && (
          <div className="es-pin es-end">
            <Btn label="Edit" icon={SlidersHorizontalIcon} active={inspectorOpen} primary onClick={() => { p.onCloseLeft(); useEditUi.getState().set({ inspectorOpen: !inspectorOpen }); }} />
          </div>
        )}
      </nav>
    </>
  );
}
