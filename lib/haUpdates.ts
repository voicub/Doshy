// Pending Home Assistant updates (update.* entities): what is available, grouped in plain words. Read-only.
import { httpUrl } from "./safeMarkdown.ts";
import { selectStates } from "./statesMerge.ts";

type UpdateKind = "core" | "os" | "addon" | "integration" | "device" | "card" | "other";
const KIND_ORDER: readonly UpdateKind[] = ["core", "os", "addon", "integration", "device", "card", "other"];
export const KIND_LABEL: Record<UpdateKind, string> = {
  core: "Home Assistant", os: "Operating system", addon: "Add-ons", integration: "Integrations (HACS)", device: "Devices (firmware)", card: "Dashboard cards", other: "Other",
};

export type UpdateAttrs = {
  friendly_name?: string; title?: string; installed_version?: string; latest_version?: string; release_url?: string; release_summary?: string;
  in_progress?: boolean | number; update_percentage?: number; skipped_version?: string; entity_picture?: string;
};
type States = Record<string, { state: string; attributes: UpdateAttrs }>;

export type UpdateItem = {
  id: string; name: string; kind: UpdateKind; installed?: string; latest?: string; versions: string; summary: string;
  releaseUrl: string | null; installing: boolean; percent: number | null;
};

/** Where an update comes from, guessed from its id, picture and release link. */
export function updateKind(id: string, picture?: string, releaseUrl?: string): UpdateKind {
  if (/^update\.home_assistant_(core|supervisor)_update$/.test(id)) return "core";
  if (id === "update.home_assistant_operating_system_update") return "os";
  if (picture?.includes("/api/hassio/addons/")) return "addon";
  if (/firmware/.test(id) || picture?.includes("zigbee2mqtt")) return "device";
  if (releaseUrl?.includes("github.com")) return picture ? "integration" : "card"; // custom integrations have a brand icon, dashboard cards do not
  return "other";
}

/** "2025.1 -> 2025.2". Without a known current version: "New version 2025.2". */
function versionText(installed?: string, latest?: string): string {
  if (!latest) return installed ?? "";
  return installed && installed !== latest ? `${installed} -> ${latest}` : `New version ${latest}`;
}

const SUMMARY_MAX = 160;
/** One short plain-text line out of a release summary. */
export function shortSummary(s?: string): string {
  const t = (s ?? "").replace(/[#*_`>[\]]/g, "").replace(/\s+/g, " ").trim();
  return t.length > SUMMARY_MAX ? `${t.slice(0, SUMMARY_MAX - 3).trimEnd()}...` : t;
}

const clampPct = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null);

function itemOf(id: string, a: UpdateAttrs): UpdateItem {
  const installing = !!a.in_progress;
  return {
    id,
    name: a.title || a.friendly_name?.replace(/\s+update$/i, "") || id.slice(7),
    kind: updateKind(id, a.entity_picture, a.release_url),
    installed: a.installed_version,
    latest: a.latest_version,
    versions: versionText(a.installed_version, a.latest_version),
    summary: shortSummary(a.release_summary),
    releaseUrl: httpUrl(a.release_url),
    installing,
    percent: installing ? clampPct(a.update_percentage) : null,
  };
}

type UpdateGroup = { kind: UpdateKind; label: string; items: UpdateItem[] };
type UpdateList = { available: UpdateGroup[]; availableCount: number; skipped: UpdateItem[]; upToDate: UpdateItem[] };

/** Available updates by kind (Home Assistant first), skipped ones apart, and how many things are up to date. Unavailable entities are ignored. */
export function listUpdates(states: States): UpdateList {
  const byKind = new Map<UpdateKind, UpdateItem[]>();
  const skipped: UpdateItem[] = [];
  const upToDate: UpdateItem[] = [];
  for (const [id, st] of Object.entries(states)) {
    if (!id.startsWith("update.") || (st.state !== "on" && st.state !== "off")) continue;
    const a = st.attributes;
    const isSkipped = !!a.skipped_version && (st.state === "off" || a.skipped_version === a.latest_version);
    if (isSkipped) skipped.push(itemOf(id, a));
    else if (st.state === "on") {
      const it = itemOf(id, a);
      byKind.set(it.kind, [...(byKind.get(it.kind) ?? []), it]);
    } else upToDate.push(itemOf(id, a));
  }
  const byName = (a: UpdateItem, b: UpdateItem) => a.name.localeCompare(b.name);
  const available = KIND_ORDER.flatMap((kind) => {
    const items = byKind.get(kind);
    return items ? [{ kind, label: KIND_LABEL[kind], items: items.sort(byName) }] : [];
  });
  return { available, availableCount: available.reduce((n, g) => n + g.items.length, 0), skipped: skipped.sort(byName), upToDate: upToDate.sort(byName) };
}

/** Store selector: how many updates wait. Recomputed only when the entity map changes (shared by the bell, the inbox tabs and the compact menu). */
export const updatesAvailable = selectStates((states) => listUpdates(states).availableCount);
