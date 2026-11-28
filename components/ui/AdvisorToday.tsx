"use client";
import { useEffect } from "react";
import { LightbulbIcon } from "@phosphor-icons/react";
import { useAdvisor } from "@/lib/advisorStore";
import { useAdvisorUi } from "./advisorUi";
import "./advisor.css";

/** The best few ideas of the day, small. `wall`: a wall-display slide (shown whether or not the Live card is on; it asks for its own update). */
export function AdvisorToday({ wall = false }: { wall?: boolean }) {
  const todayCard = useAdvisor((s) => s.settings.todayCard);
  const loaded = useAdvisor((s) => s.loaded);
  const result = useAdvisor((s) => s.result);
  useEffect(() => {
    if (wall && loaded && !useAdvisor.getState().result) void useAdvisor.getState().refresh();
  }, [wall, loaded]);
  if (!wall && !todayCard) return null;
  const top = (result?.advice ?? []).slice(0, wall ? 4 : 2);
  const body = top.length
    ? <ul>{top.map((a) => <li key={a.id}><strong>{a.title}</strong><small>{a.detail}</small></li>)}</ul>
    : <p>{result ? "Nothing worth changing today." : "Open the advisor to set it up."}</p>;
  if (wall) return <section className="adv-today" data-wall="true" aria-label="Today"><h2>Today</h2>{body}</section>;
  return <button type="button" className="adv-today" onClick={() => useAdvisorUi.getState().show()} aria-label="Open the advisor"><LightbulbIcon size={16} aria-hidden /><div>{body}</div></button>;
}
