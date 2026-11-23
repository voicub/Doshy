"use client";
import { useEffect, useState } from "react";
import { dismissStash, resolveConflict, restoreStash } from "@/lib/dbClient";
import { useSync, type PlanPreview } from "@/lib/syncStatus";
import "./syncStatus.css";

const SAVED_MS = 1800; // "Saved" stays this long, then the corner goes quiet
const SAVING_AFTER_MS = 700; // a save that quick needs no announcement

const TEXT = { saving: "Saving", saved: "Saved", offline: "Offline, will sync", error: "Not saved" } as const;

const at = (ms: number | null) => (ms ? new Date(ms).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "time unknown");
const words = (p: PlanPreview) => `${p.items} items, ${p.walls} walls, ${p.rooms} rooms`;

/** "Saving" appears only for a save slower than SAVING_AFTER_MS; "Saved" shows for SAVED_MS and then the corner goes quiet. */
function useQuietStatus(phase: string, savedAt: number | null) {
  const [shown, setShown] = useState<"saving" | "saved" | null>(null);
  useEffect(() => {
    if (phase === "saving") {
      const t = setTimeout(() => setShown("saving"), SAVING_AFTER_MS);
      return () => clearTimeout(t);
    }
    if (phase === "saved") {
      setShown("saved");
      const t = setTimeout(() => setShown(null), SAVED_MS);
      return () => clearTimeout(t);
    }
    setShown(null);
    return undefined;
  }, [phase, savedAt]);
  return shown;
}

/** The server and this device hold different plans: keep this device's, or (after a confirmation) load the server's. */
function ConflictChoice({ conflict, busy, confirming, setConfirming, onChoose }: { conflict: { server: PlanPreview; local: PlanPreview }; busy: boolean; confirming: boolean; setConfirming: (on: boolean) => void; onChoose: (choice: "server" | "mine") => void }) {
  return (
    <div className="sync-toast sync-choice hud" role="group" aria-label="Two versions of your plan">
      <strong>Two versions of your plan</strong>
      <p>{`Server: ${words(conflict.server)}, saved ${at(conflict.server.at)}.`}</p>
      <p>{`This device: ${words(conflict.local)}, edited ${at(conflict.local.at)}.`}</p>
      {!confirming ? (
        <div className="sync-row">
          <button className="btn primary" disabled={busy} onClick={() => onChoose("mine")}>Keep this device's version</button>
          <button className="btn" disabled={busy} onClick={() => setConfirming(true)}>Load the server's version...</button>
        </div>
      ) : (
        <div className="sync-confirm" role="alertdialog" aria-label="Load the server's version">
          <p>The plan on this device is stored first. You can bring it back from the banner or from Data and backups.</p>
          <div className="sync-row">
            <button className="btn" disabled={busy} onClick={() => onChoose("server")}>Yes, load the server's version</button>
            <button className="btn primary" disabled={busy} onClick={() => setConfirming(false)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Save status next to the brand (quiet while all is well); the banner for a plan this device kept; and the choice to make when the server and this device hold different plans. */
export default function SyncStatus() {
  const phase = useSync((s) => s.phase);
  const savedAt = useSync((s) => s.savedAt);
  const message = useSync((s) => s.message);
  const conflict = useSync((s) => s.conflict);
  const stash = useSync((s) => s.stash);
  const shown = useQuietStatus(phase, savedAt);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [conflict]);

  const key = phase === "offline" || phase === "error" ? phase : shown;
  const choose = async (choice: "server" | "mine") => {
    setBusy(true);
    await resolveConflict(choice);
    setBusy(false);
  };

  return (
    <>
      <div className={`sync ${key ?? "quiet"}`} role="status" aria-live="polite" title={phase === "error" ? message : undefined}>
        {key && (
          <>
            <i className="dot" aria-hidden="true" />
            <span>{TEXT[key]}</span>
          </>
        )}
      </div>
      {stash && !conflict && (
        <div className="sync-banner hud" role="status">
          <span>{`We kept your previous plan${stash.at ? ` from ${at(stash.at)}` : ""} (${stash.items} items, ${stash.walls} walls).`}</span>
          <button className="btn primary" onClick={() => restoreStash(stash)}>Restore it</button>
          <button className="btn" onClick={() => dismissStash(stash)} title="Keep it for later: it stays in Data and backups">Not now</button>
        </div>
      )}
      {conflict && <ConflictChoice conflict={conflict} busy={busy} confirming={confirming} setConfirming={setConfirming} onChoose={(c) => void choose(c)} />}
    </>
  );
}
