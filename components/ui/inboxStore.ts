"use client";
import { create } from "zustand";
import { callService } from "@/lib/ha";
import { errorMessage } from "@/lib/guards";
import { haFetch, onHomeChange } from "@/lib/haHome";
import { diffNotifications, type Notification } from "@/lib/haNotify";
import { REQUEST_TIMEOUT_MS, within } from "@/lib/requestTimeout";

export type InboxTab = "notifications" | "updates";

const SEEN_KEY = "housey-inbox-seen";
const POLL_TIP = "Home Assistant could not be asked for notifications.";

/** Notification ids shown the last time the panel was open; null when it never was. */
function readSeen(): string[] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : null;
  } catch {
    return null;
  }
}

type Inbox = {
  open: boolean;
  tab: InboxTab;
  notifications: Notification[];
  loaded: boolean;
  unavailable: boolean;
  seen: string[] | null;
  /** Dashboard-only notices never go through Home Assistant's create/dismiss services. */
  local: Notification[];
  addLocal: (notification: Notification) => void;
  toast: (Notification & { /** An appliance card to open on tap instead of the inbox (the "washing machine is done" toast). */ entity?: string }) | null;
  error: string | null;
  setOpen: (open: boolean) => void;
  openTab: (tab: InboxTab) => void;
  toggle: () => void;
  setTab: (tab: InboxTab) => void;
  clearToast: () => void;
  refresh: (fresh?: boolean) => Promise<void>;
  /** Dismiss in Home Assistant (only ever from a click). Resolves when done; failures land in `error`. */
  dismiss: (ids: string[]) => Promise<void>;
};

let epoch = 0; // counts the homes shown so far: an answer from an older one is dropped
export const useInbox = create<Inbox>()((set, get) => {
  const markSeen = () => {
    const seen = get().notifications.map((n) => n.id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* private mode: the chip just pulses again next visit */ }
    set({ seen, toast: null });
  };
  return {
    open: false,
    tab: "notifications",
    notifications: [],
    loaded: false,
    unavailable: false,
    local: [],
    addLocal: (notification) => set((s) => ({ local: [notification, ...s.local.filter((n) => n.id !== notification.id)].slice(0, 40), notifications: [notification, ...s.notifications.filter((n) => n.id !== notification.id)], toast: notification })),
    seen: null,
    toast: null,
    error: null,
    setOpen: (open) => { set({ open, error: null }); if (open && get().tab === "notifications") markSeen(); },
    openTab: (tab) => { set({ open: true, tab, error: null }); if (tab === "notifications") markSeen(); },
    toggle: () => get().setOpen(!get().open),
    setTab: (tab) => { set({ tab, error: null }); if (tab === "notifications") markSeen(); },
    clearToast: () => set({ toast: null }),
    refresh: async (fresh = false) => {
      const mine = epoch;
      try {
        const res = await haFetch(`/api/ha/notifications${fresh ? "?fresh=1" : ""}`, { cache: "no-store", signal: within(REQUEST_TIMEOUT_MS) });
        const body: { notifications?: Notification[]; error?: boolean } = await res.json();
        if (mine !== epoch) return; // another home came on screen meanwhile: this is the old home's answer
        if (!res.ok || body.error || !Array.isArray(body.notifications)) throw new Error(POLL_TIP);
        const prev = get();
        const list = [...prev.local, ...body.notifications];
        const arrived = prev.loaded ? list.filter((n) => !prev.notifications.some((p) => p.id === n.id)) : [];
        const watching = prev.open && prev.tab === "notifications";
        set({ notifications: list, loaded: true, unavailable: false, seen: prev.seen ?? readSeen(), toast: !watching && arrived.length ? arrived[0] : prev.toast });
        if (watching) markSeen();
      } catch {
        set({ unavailable: true });
      }
    },
    dismiss: async (ids) => {
      const localIds = new Set(get().local.map((n) => n.id));
      const remote = ids.filter((id) => !localIds.has(id));
      const results = await Promise.allSettled(remote.map((id) => callService({ domain: "persistent_notification", service: "dismiss", data: { notification_id: id } })));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      const gone = new Set([...ids.filter((id) => localIds.has(id)), ...remote.filter((_, i) => results[i].status === "fulfilled")]);
      set((s) => ({ local: s.local.filter((n) => !gone.has(n.id)), notifications: s.notifications.filter((n) => !gone.has(n.id)), error: failed.length ? `Could not dismiss ${failed.length === 1 ? "it" : `${failed.length} of them`}: ${errorMessage(failed[0].reason)}` : null }));
      if (gone.size) { markSeen(); await get().refresh(true); }
    },
  };
});

// Another home on screen: its notifications are not this home's. Nothing is announced for them (`loaded: false` makes the first read a quiet one).
onHomeChange(() => {
  epoch++;
  useInbox.setState({ notifications: [], local: [], loaded: false, unavailable: false, toast: null });
  void useInbox.getState().refresh(true);
});

/** How many notifications the user has not looked at yet. */
export const freshCount = (s: Pick<Inbox, "seen" | "notifications">) => diffNotifications(s.seen, s.notifications).fresh.length;
