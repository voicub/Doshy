"use client";
import { KeyIcon, PencilSimpleIcon, PlugsConnectedIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { HomesError, removeHome, testHome, type Home } from "@/lib/homesApi";
import { homesChanged, loadHomes } from "@/lib/homes";
import { agoText } from "@/lib/planLabels";
import { Confirm } from "./DataBits";
import HomeForm from "./HomeForm";
import "./homes.css";

/** The one open job of the list: only one form or question is open at a time, so the page stays short on a small screen. */
export type HomeJob = "edit" | "token" | "delete" | null;

type Status = { state: "ok" | "warn" | "bad" | "idle"; text: string };

/** The words for a home's state. Always text next to the dot: colour alone says nothing to everyone. */
export function statusOf(h: Home): Status {
  if (h.needsToken) return { state: "warn", text: "Token needs to be entered again" };
  if (h.lastError) return { state: "bad", text: `Not reachable: ${h.lastError}` };
  if (h.lastOkAt !== null) return { state: "ok", text: `Reachable (${agoText(h.lastOkAt)})` };
  return { state: "idle", text: "Not checked yet" };
}

/** The host of an address for the row (the whole address is in the tooltip). */
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** One saved home: its state, its address and the things you can do to it. `locked` = this server does not take changes to homes (only deleting stays). */
export default function HomeRow({ home, locked, job, onJob }: { home: Home; locked: boolean; job: HomeJob; onJob: (j: HomeJob) => void }) {
  const plans = useActivePlan((s) => s.list);
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const status = statusOf(home);
  const using = plans?.filter((d) => d.haConnection === home.id).map((d) => d.name) ?? [];

  const test = async () => {
    setTesting(true);
    setAnswer(null);
    try {
      const r = await testHome({ id: home.id });
      setAnswer(r.ok ? { ok: true, text: `Connected. Home Assistant ${r.version}${r.locationName ? `, "${r.locationName}"` : ""}.` } : { ok: false, text: `Not reachable: ${r.error}` });
    } catch (e) {
      setAnswer({ ok: false, text: e instanceof Error ? e.message : "The test could not run." });
    }
    setTesting(false);
    void loadHomes();
  };

  const remove = async () => {
    setProblem(null);
    try {
      await removeHome(home.id, home.plans > 0);
      onJob(null);
      await homesChanged();
    } catch (e) {
      onJob(null);
      setProblem(e instanceof HomesError ? e.message : "The home could not be deleted. Please try again.");
    }
  };

  const done = () => onJob(null);
  const n = Math.max(home.plans, using.length);
  const plansText = `${n} ${n === 1 ? "plan" : "plans"}`;
  return (
    <li className="hm-row">
      <div className="hm-main">
        <h3 className="hm-name">{home.name}</h3>
        <p className="hm-status" data-state={status.state}><span className="hm-dot" aria-hidden />{status.text}</p>
        <p className="hm-meta">
          <span title={home.url}>{hostOf(home.url)}</span>
          <span>{`Token ...${home.hint}`}</span>
          <span>{n === 0 ? "No plans use it" : plansText}</span>
        </p>
        {answer && <p className="hm-result" data-ok={answer.ok} role="status">{answer.text}</p>}
        {problem && <p className="field-note warn" role="alert">{problem}</p>}
      </div>
      {job === null && (
        <div className="hm-acts">
          {!locked && <button type="button" className="btn" disabled={testing} onClick={() => void test()}><PlugsConnectedIcon size={14} aria-hidden />{testing ? "Testing..." : "Test connection"}</button>}
          {!locked && <button type="button" className="btn" onClick={() => onJob("edit")}><PencilSimpleIcon size={14} aria-hidden />Edit</button>}
          {!locked && <button type="button" className="btn" onClick={() => onJob("token")}><KeyIcon size={14} aria-hidden />{home.needsToken ? "Enter the token" : "Enter a new token"}</button>}
          <button type="button" className="btn hm-danger" onClick={() => onJob("delete")}><TrashIcon size={14} aria-hidden />Delete</button>
        </div>
      )}
      {job === "edit" && <HomeForm mode={{ is: "edit", home }} onDone={done} onCancel={done} />}
      {job === "token" && <HomeForm mode={{ is: "token", home }} onDone={done} onCancel={done} />}
      {job === "delete" && (
        <Confirm
          label={`Delete ${home.name}`}
          text={n > 0 ? `These plans show this home: ${using.length ? using.join(", ") : plansText}. They will switch to Main home.` : `Delete "${home.name}"? Its address and token are removed from this server.`}
          yes={n > 0 ? `Delete and switch ${n} ${n === 1 ? "plan" : "plans"} to Main home` : "Delete home"}
          onYes={() => void remove()}
          onNo={done}
        />
      )}
    </li>
  );
}
