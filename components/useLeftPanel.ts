import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useStore } from "@/lib/store";
import { useRoutinesUi } from "./ui/routinesUi";
import { MAINTENANCE_EVENT, useMaintenanceUi } from "./ui/maintenanceUi";
import { isRecord } from "@/lib/guards";
import type { PlansIntent } from "./ui/planUi";
import { useHealthUi } from "./ui/healthUi";
import { useAdvisorUi } from "./ui/advisorUi";

type PlainKind = "plex" | "building" | "newplan" | "data" | "graphics" | "site" | "daylight" | "trace" | "scenes" | "routines" | "maintenance" | "homehealth" | "advisor";
/** The left slide-over: one panel at a time. `n` re-keys it so opening it again starts it fresh (a palette entry can open the browser with a search). */
type Plain = { [K in PlainKind]: { kind: K; n: number } }[PlainKind];
type Left = { kind: "browser"; q: string; n: number } | { kind: "climate"; entity?: string; n: number } | { kind: "plans"; intent?: PlansIntent; n: number } | Plain;

type Of<K extends Left["kind"]> = Extract<Left, { kind: K }> | null;

export type LeftPanel = {
  left: Left | null;
  setLeft: Dispatch<SetStateAction<Left | null>>;
  /** Each panel's state while it is the open one, else null. */
  browser: Of<"browser">;
  climate: Of<"climate">;
  plex: Of<"plex">;
  building: Of<"building">;
  newPlan: Of<"newplan">;
  data: Of<"data">;
  graphics: Of<"graphics">;
  site: Of<"site">;
  daylight: Of<"daylight">;
  trace: Of<"trace">;
  scenes: Of<"scenes">;
  routines: Of<"routines">;
  maintenance: Of<"maintenance">;
  homehealth: Of<"homehealth">;
  advisor: Of<"advisor">;
  plans: Of<"plans">;
  /** HA mode: "Map areas" opens the browser on that room's area sheet. */
  mapRoom: string | undefined;
  openBrowser: (q?: string, room?: string) => void;
  openClimate: (entity?: string) => void;
  openPlex: () => void;
  openBuilding: () => void;
  openData: () => void;
  openGraphics: () => void;
  openSite: () => void;
  openDaylight: () => void;
  openTrace: () => void;
  openScenes: () => void;
  /** The plan manager; `intent` opens it already on a new-plan form, a rename form or a delete question. */
  openPlans: (intent?: PlansIntent) => void;
  toggleBrowser: () => void;
  toggleClimate: () => void;
  togglePlex: () => void;
  toggleBuilding: () => void;
  toggleNewPlan: () => void;
  toggleData: () => void;
  toggleGraphics: () => void;
  toggleSite: () => void;
  toggleDaylight: () => void;
  toggleTrace: () => void;
  toggleScenes: () => void;
  togglePlans: () => void;
  /** Map the areas of the selected room (or the first room) to Home Assistant areas. */
  onAreas: () => void;
  /** Close whatever is open on the left, and the catalog. */
  closeLeft: () => void;
};

/** The left slide-over's state and every way to open, toggle and close its panels. Opening one closes the catalog. */
export function useLeftPanel(setCatalog: (open: boolean) => void): LeftPanel {
  const [left, setLeft] = useState<Left | null>(null);
  const [mapRoom, setMapRoom] = useState<string | undefined>();
  const browser = left?.kind === "browser" ? left : null;
  const climate = left?.kind === "climate" ? left : null;
  const plex = left?.kind === "plex" ? left : null;
  const building = left?.kind === "building" ? left : null;
  const newPlan = left?.kind === "newplan" ? left : null;
  const data = left?.kind === "data" ? left : null;
  const graphics = left?.kind === "graphics" ? left : null;
  const site = left?.kind === "site" ? left : null;
  const daylight = left?.kind === "daylight" ? left : null;
  const trace = left?.kind === "trace" ? left : null;
  const scenes = left?.kind === "scenes" ? left : null;
  const plans = left?.kind === "plans" ? left : null;
  const routines = left?.kind === "routines" ? left : null;
  const maintenance = left?.kind === "maintenance" ? left : null;
  const homehealth = left?.kind === "homehealth" ? left : null;
  const advisor = left?.kind === "advisor" ? left : null;

  const openBrowser = (q = "", room?: string) => {
    setCatalog(false);
    setMapRoom(room);
    setLeft((l) => ({ kind: "browser", q, n: (l?.n ?? 0) + 1 }));
  };
  const openClimate = useCallback((entity?: string) => {
    setCatalog(false);
    setLeft((l) => ({ kind: "climate", entity, n: (l?.n ?? 0) + 1 }));
  }, [setCatalog]);
  const openPlain = useCallback((kind: PlainKind) => {
    setCatalog(false);
    setLeft((l) => ({ kind, n: (l?.n ?? 0) + 1 }));
  }, [setCatalog]);
  const openPlans = useCallback((intent?: PlansIntent) => {
    setCatalog(false);
    setLeft((l) => ({ kind: "plans", intent, n: (l?.n ?? 0) + 1 }));
  }, [setCatalog]);
  const openPlex = useCallback(() => openPlain("plex"), [openPlain]);
  const openBuilding = useCallback(() => openPlain("building"), [openPlain]);
  const openData = useCallback(() => openPlain("data"), [openPlain]);
  const openGraphics = useCallback(() => openPlain("graphics"), [openPlain]);
  const openSite = useCallback(() => openPlain("site"), [openPlain]);
  const openDaylight = useCallback(() => openPlain("daylight"), [openPlain]);
  const openTrace = useCallback(() => openPlain("trace"), [openPlain]);
  const openScenes = useCallback(() => openPlain("scenes"), [openPlain]);
  const closeLeft = useCallback(() => {
    setCatalog(false);
    setLeft(null);
  }, [setCatalog]);
  // "Find routines" from the palette, the dock or a chip in another panel (components/ui/routinesUi.ts): open the panel, and tell the dock button whether it is open
  const routinesAsked = useRoutinesUi((s) => s.n);
  useEffect(() => {
    if (routinesAsked) openPlain("routines");
  }, [routinesAsked, openPlain]);
  useEffect(() => useRoutinesUi.setState({ open: !!routines }), [routines]);
  const maintenanceAsked = useMaintenanceUi((s) => s.n);
  useEffect(() => { if (maintenanceAsked) openPlain("maintenance"); }, [maintenanceAsked, openPlain]);
  useEffect(() => { useMaintenanceUi.setState({ open: !!maintenance }); }, [maintenance]);
  useEffect(() => {
    const open = (event: Event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
      useMaintenanceUi.getState().show(isRecord(detail) && typeof detail.taskId === "string" ? detail.taskId : undefined);
    };
    document.addEventListener(MAINTENANCE_EVENT, open);
    return () => document.removeEventListener(MAINTENANCE_EVENT, open);
  }, []);
  const healthAsked = useHealthUi((s) => s.n);
  const advisorAsked = useAdvisorUi((s) => s.n);
  useEffect(() => { if (healthAsked) openPlain("homehealth"); }, [healthAsked, openPlain]);
  useEffect(() => { if (advisorAsked) openPlain("advisor"); }, [advisorAsked, openPlain]);
  useEffect(() => { useHealthUi.setState({ open: !!homehealth }); }, [homehealth]);
  useEffect(() => { useAdvisorUi.setState({ open: !!advisor }); }, [advisor]);
  const toggle = (isOpen: boolean, open: () => void) => (isOpen ? setLeft(null) : open());

  return {
    left, setLeft, browser, climate, plex, building, newPlan, data, graphics, site, daylight, trace, scenes, routines, maintenance, homehealth, advisor, plans, mapRoom,
    openBrowser, openClimate, openPlex, openBuilding, openData, openGraphics, openSite, openDaylight, openTrace, openScenes, openPlans,
    toggleBrowser: () => toggle(!!browser, openBrowser),
    toggleClimate: () => toggle(!!climate, openClimate),
    togglePlex: () => toggle(!!plex, openPlex),
    toggleBuilding: () => toggle(!!building, openBuilding),
    toggleNewPlan: () => toggle(!!newPlan, () => openPlain("newplan")),
    toggleData: () => toggle(!!data, openData),
    toggleGraphics: () => toggle(!!graphics, openGraphics),
    toggleSite: () => toggle(!!site, openSite),
    toggleDaylight: () => toggle(!!daylight, openDaylight),
    toggleTrace: () => toggle(!!trace, openTrace),
    toggleScenes: () => toggle(!!scenes, openScenes),
    togglePlans: () => toggle(!!plans, openPlans),
    onAreas: () => {
      const { sel, plan } = useStore.getState();
      openBrowser("", sel?.type === "room" ? sel.id : plan.rooms.find((r) => !r.parent)?.id);
    },
    closeLeft,
  };
}
