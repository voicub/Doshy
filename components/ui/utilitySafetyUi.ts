import { create } from "zustand";
import { useActivePlan } from "@/lib/activePlan";
import { onGuestPage } from "@/lib/guestMode";
import { currentHome } from "@/lib/haHome";
import type { ShutoffTarget } from "@/lib/utilitiesShutoff";

export const SHUTOFF_EVENT = "housey:shutoff";
export type ShutoffRequest = { target: ShutoffTarget; home: string | null; planId: number | null };
export const useUtilitySafety = create<{ request: ShutoffRequest | null }>(() => ({ request: null }));
export const closeShutoff = () => useUtilitySafety.setState({ request: null });

export function openShutoff(target: ShutoffTarget) {
  if (onGuestPage() || useActivePlan.getState().status !== "ready") return;
  useUtilitySafety.setState({ request: { target, home: currentHome(), planId: useActivePlan.getState().id } });
}

/** The anomaly card can request a review; this event never operates a valve. */
export function suggestShutoff(sensorOrRoom: string) {
  document.dispatchEvent(new CustomEvent(SHUTOFF_EVENT, { detail: { sensorOrRoom } }));
}
