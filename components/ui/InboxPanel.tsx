"use client";
import { updatesAvailable } from "@/lib/haUpdates";
import { useStore } from "@/lib/store";
import HudPanel from "./HudPanel";
import NotificationsPanel from "./NotificationsPanel";
import UpdatesPanel from "./UpdatesPanel";
import { useInbox, type InboxTab } from "./inboxStore";
import "./inbox.css";

/** One panel, two tabs: what Home Assistant is telling you, and what can be updated. */
export default function InboxPanel() {
  const tab = useInbox((s) => s.tab);
  const setTab = useInbox((s) => s.setTab);
  const count = useInbox((s) => s.notifications.length);
  const updates = useStore(updatesAvailable);
  const tabs: [InboxTab, string][] = [["notifications", `Notifications ${count}`], ["updates", `Updates ${updates}`]];
  return (
    <HudPanel title="Inbox" meta="From Home Assistant" onClose={() => useInbox.getState().setOpen(false)} className="inbox sheet">
      <div className="inbox-tabs" role="tablist" aria-label="Inbox">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" id={`inbox-tab-${id}`} aria-selected={tab === id} aria-controls="inbox-body" onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div id="inbox-body" role="tabpanel" aria-labelledby={`inbox-tab-${tab}`} className="inbox-body">
        {tab === "notifications" ? <NotificationsPanel /> : <UpdatesPanel />}
      </div>
    </HudPanel>
  );
}
