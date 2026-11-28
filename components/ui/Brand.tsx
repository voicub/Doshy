"use client";

import { useHomeLabel } from "@/lib/homes";
import PlanSwitcher from "./PlanSwitcher";
import type { PlansIntent } from "./planUi";
import "./Brand.css";
import "./homeChip.css";

export type HaStatus = "loading" | "online" | "offline";
const TEXT: Record<HaStatus, string> = { loading: "linking", online: "online", offline: "offline" };
const CLASS: Record<HaStatus, string> = { loading: "wait", online: "ok", offline: "err" };

/** The top-left corner: the wordmark, the plan switcher (which plan is on screen, and a list to change it) and the Home Assistant link status. */
export default function Brand({ status, entities, onPlans }: { status: HaStatus; entities: number; onPlans: (intent?: PlansIntent) => void }) {
  const home = useHomeLabel(); // null while there is only one home: the chip reads as it always did
  return (
    <div className="brand">
      <div className="brand-row">
        <span className="reactor" aria-hidden />
        <h1 className="wordmark">DOSHY</h1>
        <PlanSwitcher onNew={() => onPlans({ do: "new" })} onManage={() => onPlans()} />
      </div>
      <div className={`ha ${CLASS[status]}`} role="status" aria-label={`Home Assistant ${TEXT[status]}${home ? `, ${home}` : ""}`}>
        <i className="dot" />
        <span>{`HA ${TEXT[status]}`}</span>
        {home && <span className="ha-home" title={home}>{`· ${home}`}</span>}
        {status === "online" && <span>{`${entities} ent`}</span>}
      </div>
    </div>
  );
}
