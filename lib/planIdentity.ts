/**
 * What names a plan, shared by the server (lib/db/dashboards) and the browser (lib/dbClient, lib/planFile) so both enforce the same limits.
 */

/** The settings row that holds one plan's own view of itself (time of day, cutaway, active level...). */
export const planSettingsKey = (id: number) => `housey-plan.${id}`;

export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 280;
export const ICON_RE = /^[a-z0-9-]{1,32}$/;
export const COLOR_RE = /^#[0-9a-f]{6}$/i;

/** `base`, else `base 2`, `base 3`...: a plan name nobody has in `taken` (names are unique ignoring case), within the length limit. */
export function freeName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : ` ${n}`;
    const name = base.slice(0, MAX_NAME - suffix.length).trim() + suffix;
    if (!used.has(name.toLowerCase())) return name;
  }
}

/** The most plans one install keeps (the server refuses more: lib/db/dashboards MAX_DASHBOARDS); the manager uses it to say so before you try. */
export const MAX_PLANS = 24;
