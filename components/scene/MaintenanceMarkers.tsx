"use client";
import { useMemo } from "react";
import { WrenchIcon } from "@phosphor-icons/react";
import { elevationOf } from "@/lib/levels";
import { wrenchSpots } from "@/lib/maintenanceBoard";
import { useStore } from "@/lib/store";
import { openMaintenance, useMaintenanceUi } from "../ui/maintenanceUi";
import { Marker } from "./DeclutterLayer";
import { useLevelVisibility } from "./levelState";
import "../ui/maintenance.css";

/** Static wrench dots in every quality tier. The existing marker layer handles overlap and hidden floors. */
export default function MaintenanceMarkers() {
  const plan = useStore((s) => s.plan);
  const board = useMaintenanceUi((s) => s.board);
  const { visible } = useLevelVisibility();
  const spots = useMemo(() => wrenchSpots(plan, board.items), [plan, board]);
  return <>{spots.filter((spot) => visible[spot.level] !== false).map((spot) => {
    const item = plan.items.find((i) => i.id === spot.itemId);
    const height = elevationOf(plan, spot.level) + (item ? (item.elev ?? 0) + item.h : 0.25) + 0.2;
    const label = `Maintenance: ${spot.count} due. Open ${board.items.find((i) => i.id === spot.first)?.name ?? "task"}`;
    return <Marker key={spot.key} id={`maintenance:${spot.key}`} kind="badge" position={[spot.x, height, spot.y]} label={label} group={spot.roomId}><button type="button" className="mt-marker" aria-label={label} onClick={() => openMaintenance(spot.first)}><WrenchIcon size={16} aria-hidden />{spot.count > 1 && <span>{spot.count}</span>}</button></Marker>;
  })}</>;
}
