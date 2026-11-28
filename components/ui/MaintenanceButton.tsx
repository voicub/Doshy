"use client";
import { WrenchIcon } from "@phosphor-icons/react";
import { DockButton } from "./DockParts";
import { openMaintenance, useMaintenanceUi } from "./maintenanceUi";
import "./maintenance.css";
export default function MaintenanceButton() {
  const open = useMaintenanceUi((s) => s.open);
  const count = useMaintenanceUi((s) => s.board.counts.now);
  return <DockButton label={`Maintenance${count ? ` · ${count} due` : ""}`} text={`Maintenance${count ? ` · ${count} due` : ""}`} active={open} onClick={() => openMaintenance()}><WrenchIcon size={18} aria-hidden />{count > 0 && <span className="mt-count" aria-hidden>{count}</span>}</DockButton>;
}
