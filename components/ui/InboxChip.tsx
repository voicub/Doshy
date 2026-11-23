"use client";
import { ArrowCircleUpIcon, BellIcon, XIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { updatesAvailable } from "@/lib/haUpdates";
import { useStore } from "@/lib/store";
import { freshCount, useInbox } from "./inboxStore";
import { DEVICE_EVENT } from "./serviceActions";
import "./inbox.css";

const POLL_MS = 30_000;
const TOAST_MS = 8_000;

/** Bell with the number of notifications, and the number of updates waiting. Polls Home Assistant every 30 s while the tab is visible. */
export default function InboxChip() {
  const refresh = useInbox((s) => s.refresh);
  const open = useInbox((s) => s.open);
  const count = useInbox((s) => s.notifications.length);
  const fresh = useInbox(freshCount);
  const updates = useStore(updatesAvailable);

  useEffect(() => {
    const tick = () => { if (!document.hidden) void refresh(); };
    tick();
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);

  const label = `${count} notification${count === 1 ? "" : "s"}${fresh ? ` (${fresh} new)` : ""}, ${updates} update${updates === 1 ? "" : "s"} available. Open inbox`;
  return (
    <button className={`t-btn t-inbox ${fresh ? "new" : ""}`} aria-pressed={open} aria-label={label} title="Notifications and updates (I)" onClick={() => useInbox.getState().toggle()}>
      <BellIcon size={15} />
      <span className="t-val">{count}</span>
      <ArrowCircleUpIcon size={15} className="t-inbox-up" />
      <span className="t-val">{updates}</span>
      {fresh > 0 && <i className="t-inbox-dot" aria-hidden />}
    </button>
  );
}

/** A new notification appears for 8 seconds, one at a time, unless the panel is open. */
export function InboxToast() {
  const toast = useInbox((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useInbox.getState().clearToast(), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="hud brackets inbox-toast" role="status">
      <button
        className="inbox-toast-main"
        onClick={() => {
          if (!toast.entity) return useInbox.getState().openTab("notifications");
          window.dispatchEvent(new CustomEvent(DEVICE_EVENT, { detail: { entity: toast.entity } })); // an appliance toast opens the appliance card
          useInbox.getState().clearToast();
        }}
      >
        <strong>{toast.title}</strong>
        <span>{toast.message.replace(/[\r\n]+/g, " ").slice(0, 120)}</span>
      </button>
      <button className="icon-btn" aria-label="Hide notification" onClick={() => useInbox.getState().clearToast()}><XIcon size={14} /></button>
    </div>
  );
}
