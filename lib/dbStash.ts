import { ApiError, NetError, saveVersion } from "./dbApi.ts";
import { takeField } from "./dbMerge.ts";
import { read, store } from "./localCopy.ts";
import { belongsTo, listStash, markSeen, readStash, stashPlan, unseenStash, type StashEntry } from "./planStash.ts";
import { useSync } from "./syncStatus.ts";

/**
 * The plans this device kept before replacing them (see lib/planStash): keeping them, sending them to the server as saved versions, and the banner.
 * lib/dbClient owns the sync state; it hands over what is needed here once, as a context.
 */
export type StashContext = {
  /** stash slots still waiting to be sent to the server (also kept in the sync meta) */
  stashUp: Set<number>;
  saveMeta: () => void;
  frozen: () => boolean;
  /** the plan on screen and the home plan, null until the plans are known */
  ids: () => { planId: number | null; defaultId: number | null };
  /** the localStorage key of the plan store */
  planName: () => string;
};

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function createStash(ctx: StashContext) {
  /** Is this kept copy of the plan on screen? Copies made before several plans existed (no plan id) are of the home plan; before the plans are known that is plan 1. */
  const mine = (e: StashEntry) => {
    const { planId, defaultId } = ctx.ids();
    return belongsTo(e, planId ?? 1, defaultId ?? 1);
  };

  /** What the "We kept your previous plan" banner offers: the newest kept plan of this plan that the user has not dealt with and that differs from the plan on screen. */
  function refreshBanner() {
    const s = store();
    useSync.setState({ stash: s ? unseenStash(s, read(ctx.planName()), mine) : null });
  }

  /**
   * Keep the plan now in localStorage in the rotating stash (the last 10), BEFORE anything replaces it. `loud`: the user is told about it (banner);
   * `upload`: it is also sent to the server as a saved version "This device, <reason> <time>" so any device can restore it.
   */
  function stashLocal(doc: { name: string }, reason: string, loud: boolean, upload: boolean) {
    const s = store();
    const text = read(doc.name);
    if (!s || !text) return;
    const e = stashPlan(s, text, reason, Date.now(), ctx.ids().planId);
    if (!e) return;
    if (!loud) markSeen(s, e);
    if (upload && typeof e.slot === "number") {
      ctx.stashUp.add(e.slot);
      ctx.saveMeta();
      void uploadStashes();
    }
    refreshBanner();
  }

  /** Save a kept plan as a version of the plan it was a copy of; when that plan is gone, of the home plan, so it is never lost. */
  async function keepOnServer(e: StashEntry, label: string, body: { plan: unknown; format: number }): Promise<void> {
    const { planId, defaultId } = ctx.ids();
    const home = defaultId ?? planId;
    const target = e.planId ?? home;
    if (target === null || home === null) throw new NetError("The plans are not known yet.");
    try {
      await saveVersion(target, label, body);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && target !== home) await saveVersion(home, label, body);
      else throw err;
    }
  }

  let uploading = false;
  /** Send the kept plans that are waiting to the server as saved versions. Stops quietly while it is out of reach; tried again later. */
  async function uploadStashes(): Promise<void> {
    const s = store();
    if (!s || uploading || ctx.frozen() || !ctx.stashUp.size) return;
    uploading = true;
    try {
      for (const slot of [...ctx.stashUp]) {
        const entry = listStash(s).find((x) => x.slot === slot);
        const text = readStash(s, slot);
        const taken = text ? takeField(text, "plan") : null;
        if (!entry || !taken || taken.value === undefined) {
          ctx.stashUp.delete(slot);
          continue;
        }
        try {
          await keepOnServer(entry, `This device, ${entry.reason}${entry.at ? ` ${hhmm(entry.at)}` : ""}`.slice(0, 60), { plan: taken.value, format: taken.rest.version });
          ctx.stashUp.delete(slot);
        } catch (e) {
          if (e instanceof NetError) return;
          ctx.stashUp.delete(slot); // the server refused it (too big...): it stays on this device
          console.warn("housey: a kept plan could not be sent to the server", e);
        }
      }
    } finally {
      uploading = false;
      ctx.saveMeta();
    }
  }

  /** The kept plans of the plan on screen, newest first (for "Restore my previous version"). Kept plans of other plans show when those are open. */
  const stashEntries = (): StashEntry[] => {
    const s = store();
    return s ? listStash(s).filter(mine) : [];
  };

  /** The user has seen this kept plan and wants no banner for it. It stays in the list. */
  function dismissStash(e: StashEntry): void {
    const s = store();
    if (s) markSeen(s, e);
    refreshBanner();
  }

  return { refreshBanner, stashLocal, uploadStashes, stashEntries, dismissStash };
}
