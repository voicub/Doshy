"use client";
import { useState } from "react";
import { clearOfflineCache, workerSupported } from "@/lib/offlineWorker";

/** Display > "Offline copy": the way out if the stored copy of the app ever misbehaves. Absent where the browser cannot run a service worker (plain http outside localhost). */
export default function ClearOfflineCache() {
  const [busy, setBusy] = useState(false);
  if (!workerSupported()) return null;
  return (
    <section className="disp-sec">
      <h3 className="label disp-h">Offline copy</h3>
      <button type="button" className="btn" disabled={busy} onClick={() => { setBusy(true); void clearOfflineCache().finally(() => setBusy(false)); }}>Clear offline cache</button>
      <p className="hint">Removes the copy of the app this device keeps for when the network is down, then reloads. Your plan and settings are not touched.</p>
    </section>
  );
}
