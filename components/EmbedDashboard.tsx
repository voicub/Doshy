"use client";
import { useEffect } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { parseEmbed, roomIdByName } from "@/lib/embed";
import { useStore } from "@/lib/store";
import Atmosphere from "./ui/Atmosphere";
import Scene3D from "./Scene3D";
import { useHaAreas, useHaPolling } from "./useDashboardEffects";

/**
 * `?embed=1`: only the 3D scene, for a card on another page (docs/lovelace-card.md). Read-only: no panels, no automations, no picture upload, and the
 * database layer sends nothing (lib/dbClient `frozen`). The plan is the one `?plan=` names, else the home plan; this view never changes the plan the owner's own devices show.
 */
export default function EmbedDashboard() {
  const ready = useActivePlan((s) => s.status === "ready"); // before that the store still holds the starter plan: showing it would flash a wrong house
  const room = parseEmbed(location.search).room;
  useHaPolling(useStore((s) => s.refreshStates));
  useHaAreas();

  useEffect(() => {
    if (!ready) return;
    const s = useStore.getState();
    if (s.view !== "live") s.setView("live"); // the plan's last view may have been an editor
    const id = room ? roomIdByName(s.plan.rooms, room) : null;
    if (id) s.setIsolatedRoom(id);
  }, [ready, room]);

  return (
    <div className="app view-live">
      <section className="stage">{ready ? <Scene3D /> : <p className="embed-wait">Waiting for Doshy...</p>}</section>
      <Atmosphere view="live" />
    </div>
  );
}
