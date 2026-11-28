import { isRecord } from "../guards.ts";
import { HttpError } from "./errors.ts";
import { badRequest } from "./validate.ts";

/** What the server accepts as "a plan": shared by the plan routes (plans.ts) and plan creation (dashboards.ts). */
export const MAX_PLAN_BYTES = 5 * 1024 * 1024;

export const tooBigPlan = () => new HttpError(413, "too_big", "This plan is too large to keep on the server (5 MB at most).");

export type Summary = { items: number; walls: number; rooms: number };

/** The counts kept beside a plan; null when the stored text is not (yet) one (plans saved before migration 2, or an empty dashboard). */
export function parseSummary(s: unknown): Summary | null {
  try {
    const v: unknown = JSON.parse(String(s));
    return isRecord(v) && typeof v.items === "number" && typeof v.walls === "number" && typeof v.rooms === "number" ? { items: v.items, walls: v.walls, rooms: v.rooms } : null;
  } catch {
    return null;
  }
}

const LISTS = ["walls", "openings", "rooms", "items"];

/** A plan the server is willing to keep: its JSON text and a small summary (counts) kept beside it. */
export function checkPlan(plan: unknown): { json: string; summary: string } {
  if (!isRecord(plan) || !LISTS.every((k) => Array.isArray(plan[k]))) throw badRequest("That is not a plan the server can keep.");
  const count = (k: string) => (Array.isArray(plan[k]) ? plan[k].length : 0);
  return { json: JSON.stringify(plan), summary: JSON.stringify({ items: count("items"), walls: count("walls"), rooms: count("rooms") }) };
}
