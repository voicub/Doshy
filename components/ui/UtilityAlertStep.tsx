"use client";
import type { Alert } from "@/lib/alerts";
import { useStore } from "@/lib/store";
import { mediumOfAlert, suggestShutoff } from "@/lib/utilitiesShutoff";
import { openShutoff } from "./utilitySafetyUi";
import "./utilitySafety.css";

export default function UtilityAlertStep({ alert }: { alert: Alert }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const medium = mediumOfAlert(alert.kind);
  if (!medium) return null;
  const target = { medium, alert: alert.kind, itemId: alert.itemId, entity: alert.entity, roomId: alert.roomId };
  const suggestion = suggestShutoff(plan, states, target);
  if (!suggestion) return null;
  const closed = suggestion.reopen.length > 0;
  return (
    <div className="utility-alert-step">
      <span>{closed ? "The drawn supply is shut off. It will not reopen automatically." : suggestion.headline}</span>
      <button type="button" className="alert-btn" onClick={() => openShutoff(target)}>
        {closed ? "Valve closed · Reopen…" : suggestion.question || "Review pipe path"}
      </button>
    </div>
  );
}
