"use client";
import { useEffect, useState } from "react";
import { curtainLayers } from "@/lib/curtain";
import { isRecord } from "@/lib/guards";
import { domainOf } from "@/lib/ha";
import { REQUEST_TIMEOUT_MS, within } from "@/lib/requestTimeout";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import type { Last } from "@/lib/server/curtainAutomation";
import "./curtainOptions.css";
import "./curtainAutomation.css";

type Status = { items: Record<string, Last>; running: boolean; off: boolean; haConfigured: boolean };

const POLL_MS = 30_000;
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** The server's own JSON, checked at the top level (the per-item entries come from the same code that `Last` describes). */
const isStatus = (v: unknown): v is Status => isRecord(v) && isRecord(v.items) && typeof v.running === "boolean" && typeof v.off === "boolean" && typeof v.haConfigured === "boolean";

/** What the dashboard server's dawn rule is doing (GET /api/automation/curtains). Undefined until known, or when the server cannot say. */
function useAutomationStatus(): Status | undefined {
  const [status, setStatus] = useState<Status>();
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/automation/curtains", { cache: "no-store", signal: within(REQUEST_TIMEOUT_MS) })
        .then((r) => (r.ok ? r.json() : undefined))
        .then((s: unknown) => live && isStatus(s) && setStatus(s))
        .catch(() => undefined);
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  return status;
}

/** "Closed automatically today at 05:12", or what the rule decided to leave alone. */
function lastActionText(last: Last, now = new Date()): string {
  const at = new Date(last.at);
  const sameDay = at.toDateString() === now.toDateString();
  const when = `${sameDay ? "today" : `on ${at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`} at ${clock(at)}`;
  if (last.action === "skip") return `Left alone ${when}: ${last.why}`;
  return `${last.action === "close" ? "Closed" : "Opened"} automatically ${when}`;
}

/** The sun-blocking curtain's own rule: closes at dawn, optionally opens again at a set time. The window curtain's blackout layer must be linked to a cover. */
export function CurtainAutomation({ item }: { item: Item }) {
  const patch = useStore((s) => s.patch);
  const status = useAutomationStatus();
  const b = curtainLayers(item).blackout;
  if (!b.entity) return null;
  const set = (params: Item["params"]) => patch("item", item.id, { params });
  const withoutKey = (key: string) => {
    const { [key]: _gone, ...rest } = item.params ?? {};
    return rest;
  };
  if (domainOf(b.entity) !== "cover") return <small className="field-note">Closing at dawn works with a cover. Link this layer to a cover to use it.</small>;
  const last = status?.items[item.id];
  const stopped = status && !status.running ? (status.off ? "Automatic curtains are switched off on the dashboard server (HOUSEY_AUTOMATION=off)." : !status.haConfigured ? "Home Assistant is not set up on the dashboard server, so nothing can run by itself." : "The automatic part starts when the dashboard server is restarted.") : undefined;
  return (
    <div className="cur-auto" role="group" aria-label="Sun-blocking curtain: automatic">
      <label className="cur-check">
        <input type="checkbox" role="switch" checked={b.dawn} onChange={(e) => set(e.target.checked ? withoutKey("blackoutDawn") : { ...item.params, blackoutDawn: false })} /> Close it at dawn
      </label>
      <small className="field-note">Dawn is when the sun starts to rise, about 30 minutes before sunrise. This works even when this page is closed, as long as the dashboard server is running.</small>
      {b.dawn && (
        <div className="cur-auto-row">
          <label htmlFor={`open-at-${item.id}`}>Open it again at</label>
          <input id={`open-at-${item.id}`} type="time" value={b.openAt ?? ""} onChange={(e) => set(e.target.value ? { ...item.params, blackoutOpenAt: e.target.value } : withoutKey("blackoutOpenAt"))} />
          {b.openAt && (
            <button type="button" className="cur-auto-clear" onClick={() => set(withoutKey("blackoutOpenAt"))}>
              Clear
            </button>
          )}
        </div>
      )}
      {b.dawn && <small className="field-note">{b.openAt ? "Only if it closed by itself that day. Opening it by hand or from Home Assistant always works." : "Left empty, it stays closed until you open it, by hand or from Home Assistant."}</small>}
      {b.dawn && last && <small className="field-note" role="status">{lastActionText(last)}</small>}
      {b.dawn && stopped && <small className="field-note warn" role="status">{stopped}</small>}
    </div>
  );
}
