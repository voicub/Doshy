"use client";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { levelsOf } from "@/lib/levels";
import { isTvIn, pickTv } from "@/lib/plex";
import { isOn } from "@/lib/light";
import { roomLightEntities } from "@/lib/rooms";
import { useHomeLabel } from "@/lib/homes";
import { useStore } from "@/lib/store";
import { selectStates } from "@/lib/statesMerge";
import type { PanelKey } from "@/lib/onePanel";
import { useVp } from "@/lib/useVp";
import Atmosphere from "./ui/Atmosphere";
import Brand, { type HaStatus } from "./ui/Brand";
import PlanNotices from "./ui/PlanNotices";
import { PlanSheet } from "./ui/PlanSwitcher";
import usePlanEffects from "./ui/usePlanEffects";
import GraphicsNotice from "./ui/GraphicsNotice";
import CompassHud from "./ui/CompassHud";
import WashWatch from "./ui/WashWatch";
import { washdataOf } from "@/lib/washdata";
import Dock from "./ui/Dock";
import SyncStatus from "./ui/SyncStatus";
import OfflineClient from "./OfflineClient";
import Letterbox from "./ui/Letterbox";
import LiveBar from "./ui/LiveBar";
import LevelSwitcher from "./ui/LevelSwitcher";
import LevelViewToggle from "./ui/LevelViewToggle";
import LiveLayerSwitch from "./ui/LiveLayerSwitch";
import RainOverlay from "./ui/RainOverlay";
import OpeningToolbar from "./ui/OpeningToolbar";
import PillarToolbar from "./plan/PillarToolbar";
import WallToolbar from "./plan/WallToolbar";
import MeasureBar from "./plan/MeasureBar";
import AnnotateBar from "./plan/AnnotateBar";
import UtilityBar from "./plan/UtilityBar";
import RoomRail from "./ui/RoomRail";
import RoomDevices from "./ui/RoomDevices";
import RoomIsolate from "./ui/RoomIsolate";
import { useRoomSheet } from "./ui/roomSheetStore";
import Scene3D from "./Scene3D";
import ShortcutsOverlay from "./ui/ShortcutsOverlay";
import AlertBanner from "./ui/AlertBanner";
import EditStrip from "./EditStrip";
import EnergyPanel from "./ui/EnergyPanel";
import { useEnergyUi } from "./ui/energyUi";
import InboxPanel from "./ui/InboxPanel";
import { InboxToast } from "./ui/InboxChip";
import { useInbox } from "./ui/inboxStore";
import CalendarCard from "./ui/CalendarCard";
import { useCalendar } from "./ui/calendarStore";
import { usePeopleUi } from "./ui/peopleUi";
import MediaPanel from "./ui/MediaPanel";
import MiniPlayer from "./ui/MiniPlayer";
import { useMediaUi } from "./ui/mediaUi";
import TelemetryBar from "./ui/TelemetryBar";
import useHotkeys from "./ui/useHotkeys";
import CompactStrip from "./ui/CompactStrip";
import { useChromeUi } from "./ui/chromeUi";
import { DeviceCardPanels, LeftPanels } from "./DashboardPanels";
import { CalendarPanel, CatalogDrawer, CommandPalette, Editor2D, Inspector, PeopleSheet, StatsPanel } from "./lazyPanels";
import { Timeline } from "./lazyPanels";
import AutomationHost from "./ui/AutomationHost";
import ArrivalHost from "./ui/ArrivalHost";
import SkyChartHost from "./ui/SkyChartHost";
import ShareHost from "./ui/ShareHost";
import MaintenanceDriver from "./ui/MaintenanceDriver";
import SceneToast from "./ui/SceneToast";
import WalkHud from "./ui/WalkHud";
import { useReplay } from "@/lib/replay";
import { useReplayEffects } from "./useReplayEffects";
import { openPanels, useDashboardKeys, useHaAreas, useHaPolling, useOnePanel, useResetOnView, useRightEdge } from "./useDashboardEffects";
import { useDeviceCards } from "./useDeviceCards";
import { useLeftPanel } from "./useLeftPanel";
import HomeHealthChip, { HomeHealthDriver } from "./ui/HomeHealthChip";
import AdvisorDriver from "./ui/AdvisorDriver";
import { AdvisorToday } from "./ui/AdvisorToday";

const entityCount = selectStates((states) => Object.keys(states).length);
const tvPick = selectStates(pickTv);

/** The whole screen: the 3D scene or the plan editor, the HUD around it, and every panel that slides over it. */
export default function Dashboard() {
  const view = useStore((s) => s.view);
  const haError = useStore((s) => s.haError);
  const homeLabel = useHomeLabel(); // the name of the home on screen while there are several: "Holiday house is offline" says which one, the others are unaffected
  const hasSel = useStore((s) => s.sel !== null);
  const cinema = useStore((s) => s.cinema);
  const tool = useStore((s) => s.tool);
  const live = view === "live";
  const compact = useVp().vp !== "regular"; // tiny and small screens: top strip + bottom mode bar + menu sheet, one panel at a time
  const menu = useChromeUi((s) => s.menu);
  const house = useChromeUi((s) => s.house);
  const plansSheet = useChromeUi((s) => s.plans);
  const multiLevel = useStore((s) => levelsOf(s.plan).length > 1);
  const [catalog, setCatalog] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [stats, setStats] = useState(false); // right-docked statistics slide-over
  const energy = useEnergyUi((s) => s.open);
  const inbox = useInbox((s) => s.open);
  const roomSheet = useRoomSheet((s) => s.room !== null); // the device sheet takes the right edge: the live bar steps aside
  const media = useMediaUi((s) => s.open); // the media panel also takes the right edge
  const cal = useCalendar((s) => s.open);
  const replayOpen = useReplay((s) => s.open); // the history time bar (lazy: only mounted while open)
  const people = usePeopleUi((s) => s.open); // the People sheet is a modal: it does not take a panel slot
  const isolated = useStore((s) => s.isolatedRoom !== null); // the room view docks its device list at the right

  const lp = useLeftPanel(setCatalog);
  const { left, setLeft, browser, climate, plex, building, newPlan, data, graphics, site, plans, openClimate, openGraphics } = lp;
  usePlanEffects();
  const cards = useDeviceCards(openClimate, lp.openPlex);
  const { device, camera, curtain } = cards;

  useHaPolling(useStore((s) => s.refreshStates));
  useHaAreas();
  useResetOnView(view, { setCatalog, setStats, closeCards: cards.closeAll, setLeftBrowser: (open) => setLeft(open ? { kind: "browser", q: "", n: Date.now() } : null) });
  useRightEdge({ energy, stats, inbox, roomSheet, media, cal, setStats });
  useHotkeys({ palette: () => setPalette((p) => !p), help: () => setHelp((h) => !h), catalog: () => { setLeft(null); setCatalog((c) => !c); }, modalOpen: palette || help });
  useDashboardKeys({ palette, help, toggleBrowser: lp.toggleBrowser, toggleClimate: lp.toggleClimate, togglePlex: lp.togglePlex, setStats });
  useReplayEffects(live, palette || help);

  const open = openPanels({ menu, house, plans: plansSheet, live, stats, energy, inbox, media, cal, roomSheet, left: !!left, catalog, device: !!device, camera: !!camera, curtain: !!curtain });
  const closers: Record<PanelKey, () => void> = {
    menu: () => useChromeUi.getState().setMenu(false), house: () => useChromeUi.getState().setHouse(false), plans: () => useChromeUi.getState().setPlans(false), stats: () => setStats(false), energy: () => useEnergyUi.getState().set(false),
    inbox: () => useInbox.getState().setOpen(false), media: () => useMediaUi.getState().close(), calendar: () => useCalendar.getState().close(), roomSheet: () => useRoomSheet.getState().close(),
    left: () => setLeft(null), catalog: () => setCatalog(false), device: cards.closeDevice, camera: cards.closeCamera, curtain: cards.closeCurtain,
  };
  useOnePanel(open, closers, compact, palette || help);

  /** Dock shows the TV button only when the plan has a TV linked to a TV entity. */
  const hasTv = useStore((s) => s.plan.items.some((i) => i.entity && isTvIn(tvPick(s), s.states, i.entity)));
  // the lights linked to furniture: a new array only when the list itself changes, so dragging a sofa does not re-render the dashboard
  const linked = useStore(useShallow((s) => [...new Set(s.plan.rooms.flatMap((r) => roomLightEntities(s.plan, r)))]));
  const litCount = useStore((s) => linked.filter((id) => isOn(s.states[id])).length);
  const entities = useStore(entityCount);
  const washDevice = useStore((s) => !!device && !!washdataOf(s.states, device.entity));
  const status: HaStatus = haError ? "offline" : entities === 0 ? "loading" : "online";
  const rightEdgeFree = !stats && !energy && !inbox && !roomSheet && !media && !cal;
  const toggleCatalog = () => { setLeft(null); setCatalog((c) => !c); };

  return (
    <div className={`app view-${view} ${cinema ? "cinema" : ""} ${multiLevel ? "multi-level" : ""} ${haError ? "offline" : ""}`}>
      <section className="stage" key={view === "plan" ? "plan" : "scene"}>{view === "plan" ? <Editor2D /> : <Scene3D />}</section>
      <Atmosphere view={view} />

      <div className="chrome">
        {haError && (
          <div className="banner" role="alert">
            {homeLabel ? `${homeLabel} is offline` : "Home Assistant unreachable"}
            <span>{haError}</span>
          </div>
        )}
        {!compact && <Brand status={status} entities={entities} onPlans={lp.openPlans} />}
        <SyncStatus />
        <OfflineClient />
        <LevelSwitcher />
        {compact ? <CompactStrip status={status} lit={litCount} total={linked.length} live={live} /> : <TelemetryBar lit={litCount} total={linked.length} climate={!!climate} onClimate={lp.toggleClimate} />}
        {compact && (menu || plansSheet || (house && live)) && <div className="csheet-scrim" aria-hidden onPointerDown={() => useChromeUi.setState({ menu: false, house: false, plans: false })} />}
        {live && !left && !(compact && open.size > 0) && <CompassHud />}
        {(compact ? live && open.size === 0 : view !== "plan" && !left && !catalog) && <RoomRail compact={!live} loading={status === "loading"} />}
        {live && linked.length === 0 && status !== "loading" && (
          <p className="dock-hint hud">Link furniture to Home Assistant lights in Home Assistant mode and they will glow here.</p>
        )}
        {live && !compact && <div className="layer-slot">{replayOpen && <Timeline />}<LiveLayerSwitch /></div>}
        {live && !compact && <LevelViewToggle />}
        {live && !compact && rightEdgeFree && <LiveBar />}
        {live && compact && house && <LiveBar sheet={() => useChromeUi.getState().setHouse(false)} />}
        {live && !compact && rightEdgeFree && !isolated && <CalendarCard />}
        {live && compact && replayOpen && <Timeline />}
        {view === "furniture" && catalog && <CatalogDrawer onClose={() => setCatalog(false)} />}
        <LeftPanels lp={lp} view={view} />
        {stats && live && <StatsPanel onClose={() => setStats(false)} />}
        {energy && live && <EnergyPanel onClose={() => useEnergyUi.getState().set(false)} />}
        {inbox && <InboxPanel />}
        {cal && <CalendarPanel />}
        {live && <MediaPanel />}
        {live && !compact && <MiniPlayer />}
        {live && !compact && !left && <div className="hh-chip-slot"><HomeHealthChip /><AdvisorToday /></div>}
        <AlertBanner />
        <InboxToast />
        <SceneToast />
        {people && <PeopleSheet />}
        <PlanNotices />
        {compact && plansSheet && <PlanSheet onNew={() => lp.openPlans({ do: "new" })} onManage={() => lp.openPlans()} />}
        <WashWatch />
        <GraphicsNotice onOpen={openGraphics} />
        <DeviceCardPanels cards={cards} isWasher={washDevice} openClimate={openClimate} />
        <RoomDevices />
        {live && <RoomIsolate />}
        {view === "plan" && (tool === "door" || tool === "window") && <OpeningToolbar />}
        {view === "plan" && tool === "pillar" && <PillarToolbar />}
        {view === "plan" && tool === "wall" && <WallToolbar />}
        {view === "plan" && tool === "ruler" && <MeasureBar />}
        {view === "plan" && tool === "annotate" && <AnnotateBar />}
        {view === "plan" && tool === "pipes" && <UtilityBar />}
        {!live && (hasSel || tool === "paint" || tool === "garden" || tool === "lines") && !(compact && (left || catalog)) && <Inspector />}
        <Dock compact={compact} onHelp={() => setHelp(true)} catalog={catalog} onCatalog={toggleCatalog} browser={!!browser} onBrowser={lp.toggleBrowser} onAreas={lp.onAreas} climate={!!climate} onClimate={lp.toggleClimate} stats={stats} onStats={() => setStats((v) => !v)} plex={hasTv ? !!plex : undefined} onPlex={lp.togglePlex} building={!!building} onBuilding={lp.toggleBuilding} newPlan={!!newPlan} onNewPlan={lp.toggleNewPlan} site={!!site} onSite={lp.toggleSite} daylight={!!lp.daylight} onDaylight={lp.toggleDaylight} trace={!!lp.trace} onTrace={lp.toggleTrace} data={!!data} onData={lp.toggleData} graphics={!!graphics} onGraphics={lp.toggleGraphics} plans={!!plans} onPlans={lp.togglePlans} scenes={!!lp.scenes} onScenes={lp.toggleScenes} onPalette={() => setPalette(true)} />
        <EditStrip catalog={catalog} onCatalog={toggleCatalog} browser={!!browser} onBrowser={lp.toggleBrowser} onAreas={lp.onAreas} building={!!building} onBuilding={lp.toggleBuilding} site={!!site} onSite={lp.toggleSite} daylight={!!lp.daylight} onDaylight={lp.toggleDaylight} trace={!!lp.trace} onTrace={lp.toggleTrace} newPlan={!!newPlan} onNewPlan={lp.toggleNewPlan} left={!!left} onCloseLeft={lp.closeLeft} />
        <WalkHud />
      </div>

      <RainOverlay />
      <Letterbox />
      {palette && <CommandPalette onClose={() => setPalette(false)} onHelp={() => setHelp(true)} onBrowser={lp.openBrowser} onClimate={() => openClimate()} onDevice={(entity) => cards.openDevice({ entity })} onStats={() => setStats(true)} onPlex={lp.openPlex} onBuilding={lp.openBuilding} onSite={lp.openSite} onDaylight={lp.openDaylight} onTrace={lp.openTrace} onData={lp.openData} onGraphics={openGraphics} onPlans={lp.openPlans} onScenes={lp.openScenes} />}
      <AutomationHost />
      <ArrivalHost />
      <SkyChartHost />
      <ShareHost />
      <MaintenanceDriver />
      <HomeHealthDriver />
      <AdvisorDriver />
      {help && <ShortcutsOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}
