// Matching a name another system uses ("Küche", "living-room") to the rooms of the plan. Pure: no React, no browser.

/** Lower case, no accents, letters and digits only, single spaces: "Café-Bar #2" -> "cafe bar 2". */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const tokens = (s: string): string[] => normName(s).split(" ").filter(Boolean);

/**
 * The room a reported name means: the same name (ignoring case, accents and punctuation), else the one whose words contain all of the reported name's
 * words or the other way round ("Bedroom" in "Master bedroom"). When two rooms fit equally well the name is ambiguous: undefined, never a guess.
 */
export function matchRoomName<T extends { name: string }>(name: string, rooms: readonly T[]): T | undefined {
  const want = tokens(name);
  if (!want.length) return undefined;
  const key = want.join(" ");
  const exact = rooms.filter((r) => tokens(r.name).join(" ") === key);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  let best: T | undefined;
  let bestShared = 0;
  let bestExtra = Infinity;
  let tied = false;
  for (const r of rooms) {
    const have = tokens(r.name);
    if (!have.length) continue;
    const [small, big] = have.length <= want.length ? [have, want] : [want, have];
    if (!small.every((t) => big.includes(t))) continue;
    const extra = big.length - small.length;
    if (small.length > bestShared || (small.length === bestShared && extra < bestExtra)) (best = r), (bestShared = small.length), (bestExtra = extra), (tied = false);
    else if (small.length === bestShared && extra === bestExtra) tied = true;
  }
  return tied ? undefined : best;
}
