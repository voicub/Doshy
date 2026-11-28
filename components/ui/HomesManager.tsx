"use client";
import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { loadHomes, useHomes } from "@/lib/homes";
import HomeForm from "./HomeForm";
import HomeRow, { type HomeJob } from "./HomeRow";
import MonoLabel from "./MonoLabel";
import "./homes.css";

/** The dots stay true while the view is open (a holiday house switched on, a token that stopped working). A plain request, no animation. */
const REFRESH_MS = 30_000;

/**
 * The Homes view of the plan manager: the built-in Main home, every home added here, and "Add a home".
 * Only one form or question is open at a time (`open`: a home's id with its job, or "new" for the add form).
 */
export default function HomesManager() {
  const { main, homes, locked, loaded, error } = useHomes();
  const [open, setOpen] = useState<{ id: string; job: HomeJob } | "new" | null>(null);

  useEffect(() => {
    void loadHomes();
    const t = setInterval(() => void loadHomes(), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="hm">
      <p className="hint">Each plan can show its own Home Assistant. A plan with no home of its own shows the Main home.</p>
      {error && <p className="field-note warn" role="alert">{error}</p>}
      {locked && <p className="hint hm-locked" role="note">{locked}</p>}
      {!loaded && !error && <p className="hint" role="status">Loading your homes...</p>}
      <MonoLabel>Your homes</MonoLabel>
      <ul className="hm-list" aria-label="Homes">
        <li className="hm-row">
          <div className="hm-main">
            <h3 className="hm-name">{main.name}</h3>
            <p className="hm-meta"><span>Set by this server</span>{!main.configured && <span>No address is set on the server yet</span>}</p>
          </div>
        </li>
        {homes.map((h) => (
          <HomeRow key={h.id} home={h} locked={locked !== null} job={typeof open === "object" && open?.id === h.id ? open.job : null} onJob={(job) => setOpen(job ? { id: h.id, job } : null)} />
        ))}
      </ul>
      {locked === null &&
        (open === "new" ? (
          <HomeForm mode={{ is: "add" }} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />
        ) : (
          <div className="pm-top">
            <button type="button" className="btn primary" onClick={() => setOpen("new")}><PlusIcon size={14} aria-hidden />Add a home</button>
          </div>
        ))}
    </div>
  );
}
