// Browser side of POST /api/ha/scene and /api/ha/automation (the Home Assistant token never leaves the server).
import { isRecord } from "./guards.ts";
import { haFetch } from "./haHome.ts";
import { REQUEST_TIMEOUT_MS, within } from "./requestTimeout.ts";
import { assertLive } from "./replayGate.ts";
import { inBatches, type SceneAction } from "./scenes.ts";
import type { Recipe } from "./automations.ts";
import type { DoshyAutomation } from "./server/haAutomation.ts";

export type ActionResult = { ok: boolean; error?: string };

/** The plain sentence a failed reply carries (our routes answer `{ error }`), else a generic one. */
async function failure(res: Response): Promise<Error> {
  const body: unknown = await res.json().catch(() => null);
  return new Error(isRecord(body) && typeof body.error === "string" ? body.error : `The dashboard server answered ${res.status}.`);
}

async function post(path: string, body: unknown): Promise<unknown> {
  assertLive(); // history replay: nothing may reach Home Assistant
  const res = await haFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: within(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw await failure(res);
  return res.json().catch(() => null);
}

/** Run a list of service calls as a scene (batches of 40, one after the other): one result per call, in order. Throws with a plain sentence when a batch is refused. */
export async function postScene(actions: readonly SceneAction[]): Promise<ActionResult[]> {
  const out: ActionResult[] = [];
  for (const batch of inBatches(actions)) {
    const reply = await post("/api/ha/scene", { actions: batch });
    const results = isRecord(reply) && Array.isArray(reply.results) ? reply.results : [];
    for (const r of results) out.push(isRecord(r) && r.ok === true ? { ok: true } : { ok: false, error: isRecord(r) && typeof r.error === "string" ? r.error : "Home Assistant did not answer" });
  }
  return out;
}

export type { DoshyAutomation };
export type AutomationList = { automations: DoshyAutomation[]; notify: string[] };

const asAutomation = (v: unknown): DoshyAutomation[] =>
  Array.isArray(v)
    ? v.flatMap((a) => (isRecord(a) && typeof a.id === "string" && typeof a.entity === "string" && typeof a.name === "string" && typeof a.summary === "string" ? [{ id: a.id, entity: a.entity, name: a.name, summary: a.summary, enabled: a.enabled === true, lastTriggered: typeof a.lastTriggered === "string" ? a.lastTriggered : null }] : []))
    : [];

/** Doshy's automations in Home Assistant and the notification services it has. */
export async function loadAutomations(): Promise<AutomationList> {
  const res = await haFetch("/api/ha/automation", { cache: "no-store", signal: within(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw await failure(res);
  const body: unknown = await res.json().catch(() => null);
  const notify = isRecord(body) && Array.isArray(body.notify) ? body.notify.filter((n): n is string => typeof n === "string") : [];
  return { automations: asAutomation(isRecord(body) ? body.automations : undefined), notify };
}

/** Create the automation (only from the Create button: the server insists on `confirm`). */
export async function createAutomation(recipe: Recipe): Promise<void> {
  await post("/api/ha/automation", { action: "create", confirm: true, recipe });
}

export const setAutomationEnabled = (id: string, enabled: boolean): Promise<unknown> => post("/api/ha/automation", { action: enabled ? "enable" : "disable", id });
export const deleteAutomation = (id: string): Promise<unknown> => post("/api/ha/automation", { action: "delete", id });
