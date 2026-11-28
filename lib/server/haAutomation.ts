// What POST/GET /api/ha/automation do against Home Assistant: create an automation from a validated recipe, list, switch on or off and delete the ones Doshy made.
// Home Assistant's own config API is used (`/api/config/automation/config/<id>`, which needs an administrator's token). Only ids starting `doshy_` are ever read,
// changed or deleted. `fetchHa` is `ha` from lib/haServer.ts in production and a fake in tests, so a test can never reach a real Home Assistant.
import { ALIAS_PREFIX, AUTOMATION_ID, automationId, buildAutomation, validateRecipe, type World } from "../automations.ts";
import { errorMessage, isRecord } from "../guards.ts";
import { shapeStates } from "./haStates.ts";
import type { HaFetch } from "./haCall.ts";
import type { KnownStates } from "../sceneRun.ts";

export type AutomationReply = { status: number; body: Record<string, unknown> };

export type DoshyAutomation = { id: string; entity: string; name: string; summary: string; enabled: boolean; lastTriggered: string | null };

const NEEDS_ADMIN = "Home Assistant would not let Doshy change automations. The token in .env.local has to belong to an administrator (Home Assistant > your profile > Security > long-lived access tokens, made while signed in as an administrator).";
const MAX_LISTED = 60;
/** Services of the notify domain that are not "send this text to that phone". */
const NOT_A_TARGET = ["send_message", "persistent_notification"];

const fail = (status: number, error: string): AutomationReply => ({ status, body: { error } });

/** The plain sentence for an answer Home Assistant gave to a write. */
function refusal(res: Response, what: string): AutomationReply {
  if (res.status === 401 || res.status === 403) return fail(403, NEEDS_ADMIN);
  if (res.status === 404) return fail(404, `Home Assistant has no ${what} (it may have been removed already).`);
  return fail(502, `Home Assistant did not accept that (HTTP ${res.status}).`);
}

async function json(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

/** Every entity as the raw list Home Assistant gives (the dashboard's trimmed list drops the `id` attribute an automation carries). */
async function rawStates(fetchHa: HaFetch): Promise<Record<string, unknown>[]> {
  const res = await fetchHa("states");
  if (!res.ok) throw new Error(`Home Assistant answered HTTP ${res.status}`);
  const list = await json(res);
  if (!Array.isArray(list)) throw new Error("Home Assistant sent something unexpected");
  return list.filter(isRecord);
}

async function notifyServices(fetchHa: HaFetch): Promise<string[]> {
  const res = await fetchHa("services");
  if (!res.ok) return [];
  const list = await json(res);
  if (!Array.isArray(list)) return [];
  const notify = list.find((d) => isRecord(d) && d.domain === "notify");
  const services = isRecord(notify) && isRecord(notify.services) ? Object.keys(notify.services) : [];
  return services.filter((s) => /^[a-z0-9_]+$/.test(s) && !NOT_A_TARGET.includes(s)).map((s) => `notify.${s}`);
}

/** What a recipe may refer to: every entity (with attributes) and the notify services that exist. */
export async function loadWorld(fetchHa: HaFetch): Promise<World> {
  const [raw, notify] = await Promise.all([rawStates(fetchHa), notifyServices(fetchHa)]);
  const states: KnownStates = {};
  for (const s of shapeStates(raw)) states[s.entity_id] = { state: s.state, attributes: s.attributes };
  return { states, notify };
}

const attrText = (e: Record<string, unknown>, key: string): string | null => {
  const a = e.attributes;
  const v = isRecord(a) ? a[key] : undefined;
  return typeof v === "string" ? v : null;
};

/** Doshy's own automations, plus the notification services a recipe may pick. A config that cannot be read still lists (by its name). */
export async function listAutomations(fetchHa: HaFetch): Promise<AutomationReply> {
  try {
    const [raw, notify] = await Promise.all([rawStates(fetchHa), notifyServices(fetchHa)]);
    const mine = raw
      .filter((e) => typeof e.entity_id === "string" && e.entity_id.startsWith("automation.") && AUTOMATION_ID.test(attrText(e, "id") ?? ""))
      .slice(0, MAX_LISTED);
    const automations: DoshyAutomation[] = await Promise.all(
      mine.map(async (e) => {
        const id = attrText(e, "id") ?? "";
        const name = attrText(e, "friendly_name") ?? id;
        const cfg = await fetchHa(`config/automation/config/${id}`).then(json, () => null);
        const summary = isRecord(cfg) && typeof cfg.description === "string" ? cfg.description.replace(/\. Made by Doshy.*$/, "") : name.replace(ALIAS_PREFIX, "");
        return { id, entity: String(e.entity_id), name, summary, enabled: e.state === "on", lastTriggered: attrText(e, "last_triggered") };
      }),
    );
    return { status: 200, body: { automations, notify } };
  } catch (e) {
    return fail(502, `Home Assistant could not be asked: ${errorMessage(e)}`);
  }
}

/** Reload so the new or changed automation starts working now. Home Assistant also does this by itself after a write; a failure here is not an error. */
async function reload(fetchHa: HaFetch, id: string): Promise<void> {
  await fetchHa("services/automation/reload", { method: "POST", body: JSON.stringify({ id }) }).catch(() => undefined);
}

/** Create the automation a recipe describes. Needs `confirm: true` (the person pressed the button); the recipe is validated against what Home Assistant has. */
export async function createAutomation(body: unknown, fetchHa: HaFetch, random: () => string): Promise<AutomationReply> {
  if (!isRecord(body) || body.confirm !== true) return fail(400, "Press Create in Home Assistant to confirm.");
  try {
    const world = await loadWorld(fetchHa);
    const v = validateRecipe(body.recipe, world);
    if (!v.ok) return fail(400, v.error);
    const name = (entity: string) => world.states[entity]?.attributes.friendly_name ?? entity;
    const { id, config } = buildAutomation(v.recipe, automationId(v.recipe.type, random()), name);
    const res = await fetchHa(`config/automation/config/${id}`, { method: "POST", body: JSON.stringify(config) });
    if (!res.ok) {
      if (res.status === 400) return fail(400, "Home Assistant says that automation is not valid.");
      return refusal(res, "automation");
    }
    await reload(fetchHa, id);
    return { status: 200, body: { ok: true, id, alias: config.alias } };
  } catch (e) {
    return fail(502, `Home Assistant could not be asked: ${errorMessage(e)}`);
  }
}

/** The entity of one of Doshy's automations, found by its id (not by name): null when there is none. */
async function entityOf(fetchHa: HaFetch, id: string): Promise<string | null> {
  const e = (await rawStates(fetchHa)).find((s) => typeof s.entity_id === "string" && s.entity_id.startsWith("automation.") && attrText(s, "id") === id);
  return typeof e?.entity_id === "string" ? e.entity_id : null;
}

/** Switch one of Doshy's automations on or off. */
export async function setEnabled(id: unknown, enabled: unknown, fetchHa: HaFetch): Promise<AutomationReply> {
  if (typeof id !== "string" || !AUTOMATION_ID.test(id) || typeof enabled !== "boolean") return fail(400, "That is not one of Doshy's automations.");
  try {
    const entity = await entityOf(fetchHa, id);
    if (!entity) return fail(404, "Home Assistant has no such automation (it may have been removed already).");
    const res = await fetchHa(`services/automation/${enabled ? "turn_on" : "turn_off"}`, { method: "POST", body: JSON.stringify({ entity_id: entity }) });
    return res.ok ? { status: 200, body: { ok: true } } : refusal(res, "automation");
  } catch (e) {
    return fail(502, `Home Assistant could not be asked: ${errorMessage(e)}`);
  }
}

/** Delete one of Doshy's automations (an id that does not start with `doshy_` is refused before anything is sent). */
export async function deleteAutomation(id: unknown, fetchHa: HaFetch): Promise<AutomationReply> {
  if (typeof id !== "string" || !AUTOMATION_ID.test(id)) return fail(400, "That is not one of Doshy's automations.");
  try {
    const res = await fetchHa(`config/automation/config/${id}`, { method: "DELETE" });
    if (!res.ok) return res.status === 400 || res.status === 404 ? fail(404, "Home Assistant has no such automation (it may have been removed already).") : refusal(res, "automation");
    await reload(fetchHa, id);
    return { status: 200, body: { ok: true } };
  } catch (e) {
    return fail(502, `Home Assistant could not be asked: ${errorMessage(e)}`);
  }
}
