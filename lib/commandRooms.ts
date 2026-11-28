// Which room(s) a typed command means: whole names ("living room", "livingroom", "lounge"), partial names ("bedroom" for "Master bedroom"), small spelling slips.
// A partial name that fits several rooms is reported as a choice, never guessed. Pure; the node test runner loads this file directly.
import { normalise, ROOM_SYNONYMS, sameWord, stem, wordsOf } from "./commandWords.ts";

export type RoomRef = { id: string; name: string };

export type RoomMatch = {
  /** Every room the words point at, including the ones still to choose between. */
  rooms: RoomRef[];
  /** Rooms the words name for certain (a whole name, or a word that fits one room only). */
  chosen: RoomRef[];
  /** Groups of rooms that fit the same word: the person picks one of each. */
  choices: RoomRef[][];
  /** Word positions the room names used. */
  used: Set<number>;
};

const WEAK = new Set(["room", "area", "the"]);
type Span = [start: number, length: number];

/** Positions where `phrase` (words) starts in `words`, each word allowing a small slip. */
function phraseAt(words: readonly string[], phrase: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + phrase.length <= words.length; i++) if (phrase.every((p, j) => sameWord(stem(words[i + j]), stem(p)))) out.push(i);
  return out;
}

/** The names a room answers to as a whole: its own name, the name run together, and the usual other names for that kind of room. */
function aliases(room: RoomRef): string[][] {
  const name = normalise(room.name);
  const own = [wordsOf(name), [name.replace(/ /g, "")]];
  const extra = Object.entries(ROOM_SYNONYMS).flatMap(([key, list]) => (name === key ? list.map((l) => wordsOf(normalise(l))) : []));
  return [...own, ...extra].filter((p) => p.length);
}

const inside = (a: Span, b: Span) => b[1] > a[1] && a[0] >= b[0] && a[0] + a[1] <= b[0] + b[1];

export function findRooms(words: readonly string[], rooms: readonly RoomRef[]): RoomMatch {
  const spans = new Map<RoomRef, Span[]>(); // room -> every place its whole name appears
  const partial = new Map<number, RoomRef[]>(); // word position -> rooms that fit it only in part
  for (const room of rooms) {
    for (const alias of aliases(room)) {
      for (const at of phraseAt(words, alias)) spans.set(room, [...(spans.get(room) ?? []), [at, alias.length]]);
    }
    if (spans.has(room)) continue;
    // one distinctive word of a longer name ("bedroom" in "Master bedroom")
    const own = wordsOf(normalise(room.name)).filter((t) => !WEAK.has(t));
    if (own.length < 2) continue;
    for (const t of own) {
      const i = words.findIndex((w) => sameWord(stem(w), stem(t)));
      if (i >= 0) partial.set(i, [...(partial.get(i) ?? []), room]);
    }
  }
  // "master bedroom" also contains the whole name "bedroom": the longer name wins, the shorter room is not meant
  const whole = [...spans].filter(([room, mine]) => !mine.every((s) => [...spans].some(([other, theirs]) => other !== room && theirs.some((t) => inside(s, t))))).map(([room]) => room);
  const used = new Set<number>();
  for (const room of whole) for (const [at, len] of spans.get(room) ?? []) for (let j = 0; j < len; j++) used.add(at + j);

  // a word that already named a room in full does not also ask about partial names ("kitchen" is the Kitchen, not also "Kitchen annex")
  const choices: RoomRef[][] = [];
  const chosen = [...whole];
  for (const [i, list] of partial) {
    if (used.has(i)) continue;
    const unique = list.filter((r) => !chosen.includes(r));
    if (!unique.length) continue;
    used.add(i);
    if (unique.length === 1) chosen.push(unique[0]);
    else choices.push(unique);
  }
  return { rooms: [...chosen, ...choices.flat()], chosen, choices, used };
}

/** "everywhere", "the whole house", "all rooms": no single room is meant. */
export function wholeHome(words: readonly string[]): boolean {
  return /\b(everywhere|whole house|entire house|whole home|entire home|all rooms|every room|throughout|anywhere)\b/.test(words.join(" "));
}
