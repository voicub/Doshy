"use client";
import { CaretLeftIcon, CaretRightIcon, DoorOpenIcon, DropIcon, FireIcon, SirenIcon, SkullIcon, WarningIcon, WindIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { Alert, AlertKind } from "@/lib/alerts";
import { useAlerts } from "@/lib/alertsStore";
import { useStore } from "@/lib/store";
import AlertDriver from "./AlertDriver";
import { DEVICE_EVENT } from "./serviceActions";
import UtilityAlertStep from "./UtilityAlertStep";
import UtilityShutoffDialog from "./UtilityShutoffDialog";
import "./alerts.css";

type IconType = ComponentType<{ size?: number; weight?: "fill" | "bold" }>;
const ICON: Record<AlertKind, IconType> = { leak: DropIcon, smoke: FireIcon, gas: WindIcon, co: SkullIcon, door_open: DoorOpenIcon, window_open: DoorOpenIcon, intrusion: SirenIcon, problem: WarningIcon, anomaly: WarningIcon, weather: WindIcon };

/** The room (if the live view is showing) and the device card of the thing that is wrong: what a tap on a list row does. */
function openDetails(a: Alert) {
  const s = useStore.getState();
  if (a.roomId && s.view === "live") s.setIsolatedRoom(a.roomId);
  window.dispatchEvent(new CustomEvent(DEVICE_EVENT, { detail: { entity: a.entity } }));
}

/** Pages through the queue and tells the page how tall it is (`--alert-h`), so the bars that sit just under the top row move down with it. */
function Banner({ queue }: { queue: Alert[] }) {
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const n = queue.length;
  const a = queue[Math.min(index, n - 1)];
  const Icon = ICON[a.kind];
  const critical = a.severity === "critical";

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const root = document.documentElement;
    const size = () => root.style.setProperty("--alert-h", `${el.offsetHeight + 8}px`);
    root.setAttribute("data-alert", "1");
    size();
    const watch = new ResizeObserver(size);
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.removeAttribute("data-alert");
      root.style.removeProperty("--alert-h");
    };
  }, []);

  const step = (d: number) => setIndex((i) => (Math.min(i, n - 1) + d + n) % n);
  return (
    <div ref={box} className={`alert-banner ${critical ? "critical" : "warning"}`} role={critical ? "alert" : "status"} aria-live={critical ? "assertive" : "polite"}>
      <Icon size={26} weight="fill" />
      <div className="alert-text">
        <strong className="alert-title">{a.title}{a.roomName ? ` · ${a.roomName}` : ""}</strong>
        <span className="alert-msg">{a.message}</span>
      </div>
      {n > 1 && (
        <div className="alert-pager" role="group" aria-label="Alerts">
          <button type="button" className="alert-btn alert-icon" aria-label="Previous alert" onClick={() => step(-1)}><CaretLeftIcon size={16} weight="bold" /></button>
          <span className="alert-count">{Math.min(index, n - 1) + 1} of {n}</span>
          <button type="button" className="alert-btn alert-icon" aria-label="Next alert" onClick={() => step(1)}><CaretRightIcon size={16} weight="bold" /></button>
        </div>
      )}
      <div className="alert-actions">
        <button type="button" className="alert-btn" onClick={() => useAlerts.getState().acknowledge([a.id])}>Acknowledge</button>
        <button type="button" className="alert-btn" onClick={() => useAlerts.getState().snooze([a.id])}>Snooze 10 min</button>
        <button type="button" className="alert-btn" onClick={() => openDetails(a)}>Details</button>
      </div>
      <UtilityAlertStep alert={a} />
    </div>
  );
}

/** The alert strip under the top bar (and the engine behind it). Shows the alerts nobody has answered yet; mounted once, in the Dashboard. */
export default function AlertBanner() {
  const queue = useAlerts((s) => s.queue);
  // a new most-serious alert starts again at the first page (the key), so it is never hidden behind one the owner paged to
  return (
    <>
      <AlertDriver />
      <UtilityShutoffDialog />
      {queue.length > 0 && <Banner key={queue[0].id} queue={queue} />}
    </>
  );
}
