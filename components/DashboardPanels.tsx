"use client";
import type { View } from "@/lib/store";
import { useActivePlan } from "@/lib/activePlan";
import { MaintenancePanel } from "./lazyPanels";
import GraphicsPanel from "./ui/GraphicsPanel";
import type { DeviceCards } from "./useDeviceCards";
import type { LeftPanel } from "./useLeftPanel";
import { BuildingPanel, CameraCard, ClimatePanel, CurtainCard, DataPanel, DaylightPanel, DeviceCard, EntityBrowser, NewPlanPanel, PlanManager, PlexCard, RoutinesPanel, ScenesPanel, SitePanel, TracePanel, WashCard } from "./lazyPanels";
import { HomeHealthPanel, AdvisorPanel } from "./lazyPanels";

/** The panel of the left slide-over that is open, if any (building, new plan, site and the plan-only ones only in Plan mode). */
export function LeftPanels({ lp, view }: { lp: LeftPanel; view: View }) {
  const { building, newPlan, data, graphics, site, daylight, trace, plans, browser, climate, plex, scenes, routines, mapRoom, setLeft } = lp;
  const maintenancePlan = useActivePlan((s) => s.id);
  const close = () => setLeft(null);
  const plan = view === "plan";
  return (
    <>
      {building && plan && <BuildingPanel key={building.n} onClose={close} />}
      {newPlan && plan && <NewPlanPanel key={newPlan.n} onClose={close} />}
      {data && <DataPanel key={data.n} onClose={close} onHomes={() => lp.openPlans({ do: "homes" })} />}
      {plans && <PlanManager key={plans.n} intent={plans.intent} onClose={close} />}
      {graphics && <GraphicsPanel key={graphics.n} onClose={close} />}
      {site && plan && <SitePanel key={site.n} onClose={close} />}
      {daylight && (plan || view === "live") && <DaylightPanel key={daylight.n} onClose={close} />}
      {trace && plan && <TracePanel key={trace.n} onClose={close} />}
      {browser && <EntityBrowser key={browser.n} initialQuery={browser.q} initialMapRoom={mapRoom} onClose={close} />}
      {climate && <ClimatePanel key={climate.n} entity={climate.entity} onClose={close} />}
      {plex && <PlexCard key={plex.n} onClose={close} />}
      {scenes && <ScenesPanel key={scenes.n} onClose={close} />}
      {routines && <RoutinesPanel key={routines.n} onClose={close} />}
      {lp.maintenance && <MaintenancePanel key={`${maintenancePlan}:${lp.maintenance.n}`} onClose={close} />}
      {lp.homehealth && <HomeHealthPanel key={lp.homehealth.n} onClose={close} />}
      {lp.advisor && <AdvisorPanel key={lp.advisor.n} onClose={close} />}
    </>
  );
}

/** The device popover (or the washing machine's card), the camera picture and the curtain card. */
export function DeviceCardPanels({ cards, isWasher, openClimate }: { cards: DeviceCards; isWasher: boolean; openClimate: (entity?: string) => void }) {
  const { device, camera, curtain, closeDevice, closeCamera, closeCurtain } = cards;
  return (
    <>
      {device && (isWasher ? <WashCard key={device.n} target={device} onClose={closeDevice} /> : <DeviceCard key={device.n} target={device} onClose={closeDevice} onClimate={openClimate} />)}
      {camera && <CameraCard key={camera.n} target={camera} onClose={closeCamera} />}
      {curtain && <CurtainCard key={curtain.n} target={curtain} onClose={closeCurtain} />}
    </>
  );
}
