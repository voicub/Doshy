"use client";
import { useEffect, useState } from "react";
import { carsToUpgrade, recheckToken, tryNext, upgradeAll, upgradeCar, useCarJobs } from "@/lib/carAuto";
import { tokenStatus } from "@/lib/carImport";
import { useCarModels } from "@/lib/carModelStore";
import { CATALOG } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import "./carModelFinder.css";

const ENV_LINE = "SKETCHFAB_TOKEN=paste-your-token-here";

/**
 * Three small steps instead of a dead end: get a free token, put it in `.env.local`, check again. Shown whenever a download needs the owner's own
 * Sketchfab token (the token stays on the server; this page only ever learns whether one is set).
 */
export function TokenCard({ onFound }: { onFound?: () => void }) {
  const [state, setState] = useState<"idle" | "checking" | "found" | "missing">("idle");
  const [copied, setCopied] = useState(false);

  const check = async () => {
    setState("checking");
    const ok = await recheckToken();
    setState(ok ? "found" : "missing");
    if (ok) onFound?.();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ENV_LINE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false); // clipboard blocked: the line is also written out below to copy by hand
    }
  };

  return (
    <section className="cmf-token-card" aria-label="Set up downloads">
      <h3>Real models need a free Sketchfab token (3 steps)</h3>
      <ol>
        <li>
          Sign in to a free account and copy your API token from{" "}
          <a href="https://sketchfab.com/settings/password" target="_blank" rel="noopener noreferrer">sketchfab.com/settings/password</a>.
        </li>
        <li>
          Add this line to the <code>.env.local</code> file next to <code>package.json</code> (replace the words after the equals sign with your token):
          <span className="cmf-envline">
            <code>{ENV_LINE}</code>
            <button type="button" className="btn" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
          </span>
        </li>
        <li>Restart the dev server if it does not notice by itself, then press the button below.</li>
      </ol>
      <div className="cmf-envrow">
        <button type="button" className="btn primary" disabled={state === "checking"} onClick={() => void check()}>I added it, check again</button>
        <span className="field-note" role="status">
          {state === "checking" && "Checking..."}
          {state === "found" && "Token found. You can use real models now."}
          {state === "missing" && "Not found yet. Save .env.local and restart the dev server, then check again."}
        </span>
      </div>
      <p className="field-note">The token stays on this computer&rsquo;s server and is never sent to the browser. Searching works without it.</p>
    </section>
  );
}

/** Progress, result and the next step of one car's automatic pick. Renders nothing before one was started. */
export function AutoStatus({ carId }: { carId: string }) {
  const job = useCarJobs((s) => s.jobs[carId]);
  if (!job) return null;
  if (job.state === "failed" && job.needsToken) return <TokenCard onFound={() => upgradeCar(carId)} />;
  const busy = job.state === "queued" || job.state === "working";
  return (
    <div className={`cmf-auto${job.state === "failed" ? " bad" : ""}`} role="status">
      <p>{busy ? `${job.label}...` : job.message ?? job.label}</p>
      {busy && (
        <div className="cmf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.f * 100)} aria-label="Preparing the real model">
          <i style={{ width: `${Math.round(job.f * 100)}%` }} />
        </div>
      )}
      {job.state === "failed" && <button type="button" className="btn" onClick={() => upgradeCar(carId, job.tried)}>Try again</button>}
    </div>
  );
}

/** "Use a real model (automatic)" for one car, or "Not right? Try the next one" when it already has one. */
export function AutoButton({ carId, hasModel }: { carId: string; hasModel: boolean }) {
  const busy = useCarJobs((s) => { const j = s.jobs[carId]; return j?.state === "queued" || j?.state === "working"; });
  return hasModel ? (
    <button type="button" className="btn" disabled={busy} onClick={() => tryNext(carId)}>Not right? Try the next one</button>
  ) : (
    <button type="button" className="btn primary cmr-big" disabled={busy} onClick={() => upgradeCar(carId)}>Use a real model (automatic)</button>
  );
}

/** The plan-wide tools: upgrade every car in the plan, with a result line per car, and the "fetch when I place a car" switch. */
export function CarTools() {
  const items = useStore((s) => s.plan.items);
  const models = useCarModels((s) => s.models);
  const autoFetch = useCarModels((s) => s.autoFetch);
  const jobs = useCarJobs((s) => s.jobs);
  const [token, setToken] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void tokenStatus().then((ok) => live && setToken(ok));
    return () => {
      live = false;
    };
  }, []);
  // kinds of cars in the plan, from the list of items (cheap: one pass)
  const kinds = [...new Set(items.map((i) => i.kind))].filter((k) => CATALOG[k]?.car);
  if (!kinds.length && !autoFetch) return null;
  const todo = carsToUpgrade();
  const shown = kinds.filter((k) => jobs[k]);
  const running = shown.some((k) => jobs[k].state === "queued" || jobs[k].state === "working");
  return (
    <div className="cmf-tools">
      {kinds.length > 0 && (
        <button type="button" className="btn" disabled={running || !todo.length} onClick={() => upgradeAll()}>
          {todo.length ? `Upgrade all cars in my plan (${todo.length})` : "All cars in my plan have a real model"}
        </button>
      )}
      {token === false && shown.every((k) => jobs[k].state !== "failed" || !jobs[k].needsToken) && todo.length > 0 && (
        <p className="field-note">Needs a Sketchfab token first: press the button to see the steps.</p>
      )}
      {shown.length > 0 && (
        <ul className="cmf-joblist" aria-label="Real model progress">
          {shown.map((k) => (
            <li key={k} className={jobs[k].state}>
              <span>{CATALOG[k]?.label ?? k}</span>
              <span>{jobs[k].state === "done" ? "Real model" : jobs[k].state === "failed" ? "Not done" : `${Math.round(jobs[k].f * 100)}%`}</span>
              {jobs[k].state === "failed" && !jobs[k].needsToken && <small>{jobs[k].message}</small>}
            </li>
          ))}
        </ul>
      )}
      {shown.some((k) => jobs[k].needsToken) && <TokenCard onFound={() => upgradeAll()} />}
      <label className="cmr-check">
        <input type="checkbox" checked={autoFetch} onChange={(e) => useCarModels.getState().setAutoFetch(e.target.checked)} />
        Fetch a real model automatically when I place a car
      </label>
      {Object.keys(models).length === 0 && autoFetch && <p className="field-note">Needs a Sketchfab token. Placed cars get their model in the background.</p>}
    </div>
  );
}
