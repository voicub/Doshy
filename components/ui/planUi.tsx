"use client";
import { BriefcaseIcon, BuildingsIcon, CarIcon, HouseIcon, MountainsIcon, PaintBrushIcon, StorefrontIcon, TreeIcon, type Icon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { create } from "zustand";
import { activeDashboard, switchPlan, type PlanProblem } from "@/lib/activePlan";
import { planLink } from "@/lib/planLabels";

/** What a plan can look like in the lists: a handful of icons and colours, so choosing is a tap, not a search. Keys are what the server stores. */
export const PLAN_ICONS: { key: string; label: string; Icon: Icon }[] = [
  { key: "house", label: "House", Icon: HouseIcon },
  { key: "building", label: "Building", Icon: BuildingsIcon },
  { key: "garden", label: "Garden", Icon: TreeIcon },
  { key: "office", label: "Office", Icon: BriefcaseIcon },
  { key: "cabin", label: "Cabin", Icon: MountainsIcon },
  { key: "garage", label: "Garage", Icon: CarIcon },
  { key: "studio", label: "Studio", Icon: PaintBrushIcon },
  { key: "shop", label: "Shop", Icon: StorefrontIcon },
];

export const PLAN_COLORS: { value: string; label: string }[] = [
  { value: "#5ad7ff", label: "Cyan" },
  { value: "#4fe3a1", label: "Green" },
  { value: "#ffd166", label: "Amber" },
  { value: "#ff8f6b", label: "Orange" },
  { value: "#ff7ab6", label: "Pink" },
  { value: "#b69cff", label: "Violet" },
  { value: "#9fb3c0", label: "Grey" },
];

/** A plan's icon in its colour. An icon the app does not know (a file from a newer version) shows the house. */
export function PlanGlyph({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) {
  const Glyph = PLAN_ICONS.find((i) => i.key === icon)?.Icon ?? HouseIcon;
  return <span className="pg" style={color ? { color } : undefined}><Glyph size={size} aria-hidden /></span>;
}

/** The sentence for something that went wrong with a plan action, in plain words. */
export function problemText(p: PlanProblem): string {
  if (p.code === "unsaved") return "Sending your latest changes failed, so Doshy stayed on this plan.";
  return p.message;
}

/** Small things the plan UI says and does outside its own panels: a one-line message, what "Try again" repeats, and how many plan lists are open (they show a failed action themselves, so the screen's message stays quiet). */
export const usePlanUi = create<{ message: string | null; retry: (() => void) | null; lists: number }>(() => ({ message: null, retry: null, lists: 0 }));

/** Call from a panel that shows the plan store's `error` itself. */
export function useShowsErrors(): void {
  useEffect(() => {
    usePlanUi.setState((s) => ({ lists: s.lists + 1 }));
    return () => usePlanUi.setState((s) => ({ lists: s.lists - 1 }));
  }, []);
}

const MESSAGE_MS = 4000;
let messageTimer: ReturnType<typeof setTimeout> | undefined;

export function say(message: string): void {
  clearTimeout(messageTimer);
  usePlanUi.setState({ message });
  messageTimer = setTimeout(() => usePlanUi.setState({ message: null }), MESSAGE_MS);
}

/** Show plan `id`. When it fails the reason is in `useActivePlan().error` (the notices show it) and "Try again" repeats this. Resolves to whether it worked. */
export async function goToPlan(id: number): Promise<boolean> {
  usePlanUi.setState({ retry: () => void goToPlan(id) });
  try {
    await switchPlan(id);
    usePlanUi.setState({ retry: null });
    return true;
  } catch {
    return false; // the reason is already in the plan store's `error`
  }
}

/** Put text on the clipboard. Plain http (a wall display on the local network) has no `navigator.clipboard`, so fall back to the old way. False when neither worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(box);
    box.select();
    try {
      return document.execCommand("copy");
    } finally {
      box.remove();
    }
  }
}

/** "Copy a link that opens this plan": the address of this page pinned to plan `id`. When copying is not possible the link is shown so it can be copied by hand. */
export async function copyPlanLink(id: number): Promise<void> {
  const link = planLink(location.href, id);
  const name = activeDashboard()?.id === id ? activeDashboard()?.name : undefined;
  say((await copyText(link)) ? `Link copied${name ? ` for ${name}` : ""}. Open it on any device to show this plan.` : `Copy this link: ${link}`);
}

/** What the plan manager opens on: a new-plan form, a rename form for plan `id`, the "delete this plan?" question for plan `id`, or the Homes view. Nothing = the list. */
export type PlansIntent = { do: "new" } | { do: "homes" } | { do: "edit"; id: number } | { do: "delete"; id: number };
