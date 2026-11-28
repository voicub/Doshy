// The command box's brain: typed words in, "what I understood" out. Deterministic and offline: synonyms, fuzzy room names, numbers and percents, no model and no network.
// It never sends anything: it returns the service calls it would make (or an answer, a question back, or a refusal) and the box asks for a confirmation first.
// Every call passes the same validation as the server (lib/sceneRun.ts), so nothing outside the allowlist can come out. Pure; the node test runner loads this file directly.
import { answerContacts, answerState, answerTemperature, isKindWord, type Scope } from "./commandAnswer.ts";
import { findRooms, wholeHome, type RoomRef } from "./commandRooms.ts";
import { amountOf, FILLER, KIND_NOUN, kindsIn, normalise, onOffOf, pluralise, sameWord, stem, wordsOf, type Amount } from "./commandWords.ts";
import type { HAState } from "./ha.ts";
import type { Contact, DeviceKind, SceneDevice } from "./sceneDevices.ts";
import { checkBatch } from "./sceneRun.ts";
import { inBatches, sceneActions, type SceneAction, type SceneStep } from "./scenes.ts";

export type CommandContext = {
  /** The plan's own rooms (alcoves count with their host). `tempEntity` is the room's temperature sensor, when it has one. */
  rooms: readonly (RoomRef & { tempEntity?: string })[];
  devices: readonly SceneDevice[];
  contacts: readonly Contact[];
  scenes: readonly { id: string; name: string; steps: SceneStep[] }[];
  states: Record<string, HAState>;
  /** The room the person is looking at: used when the text names none. */
  here?: string | null;
};

/** The answer to a "which room?" question: the rooms to use. */
export type Pick = { rooms: readonly string[] | "all" };

export type Reply =
  /** Something to do: shown with a Confirm button, then run as `steps` (their `actions` are the service calls, kept so a test or a preview can read them). */
  | { kind: "run"; summary: string; steps: SceneStep[]; actions: SceneAction[]; entities: string[]; scene?: string }
  /** A read-only answer, shown at once. */
  | { kind: "answer"; text: string }
  /** A question back; each option is the answer to give to `parseCommand` again, with the same text. */
  | { kind: "ask"; question: string; options: { label: string; pick: Pick }[] }
  /** Not understood, or refused: the plain reason. */
  | { kind: "no"; message: string; refused?: true };

const no = (message: string): Reply => ({ kind: "no", message });
export const HELP = 'Try "turn off the lights in the bedroom", "close all curtains", "set living room to 22", "dim the office lights to 30%", "run movie night" or "is the bathroom window open?".';
const REFUSED = "Doshy will not do that from the text box. It can switch lights, TVs, fans and plugs, move curtains, set the heating and run your scenes. Locks, alarms, garage doors and system settings stay in Home Assistant.";

const SWITCH_VERBS = ["turn", "switch", "put", "shut", "power", "flip", "kill"];
const OPENERS = ["open", "raise", "lift"];
const CLOSERS = ["close", "shut", "lower", "pull", "draw", "drop"];
const RUN_VERBS = ["run", "start", "activate", "launch", "trigger", "play", "scene"];
const DENIED = /\b(unlock|lock|alarm|disarm|arm|restart|reboot|shutdown|delete|erase|format|password|token|router|firewall|update|install|reset|doorbell)\b/;
const QUESTION = /^(is|are|what|which|how|does|do|any|anything|tell|show|list|whos)\b/;

const hasPhrase = (words: readonly string[], phrase: readonly string[]) => phrase.length > 0 && words.some((_, i) => i + phrase.length <= words.length && phrase.every((p, j) => sameWord(stem(words[i + j]), stem(p))));

/** The scene the words name, when they ask to run it: it has to be named in full, and either say run/start/activate or be nothing but the name. */
function sceneFor(words: readonly string[], ctx: CommandContext): CommandContext["scenes"][number] | null {
  const named = [...ctx.scenes].sort((a, b) => b.name.length - a.name.length).find((s) => hasPhrase(words, wordsOf(normalise(s.name))));
  if (!named) return null;
  const nameWords = wordsOf(normalise(named.name));
  const rest = words.filter((w) => !FILLER.has(w) && !nameWords.some((n) => sameWord(stem(w), stem(n))));
  return words.some((w) => RUN_VERBS.includes(w)) || !rest.length ? named : null;
}

const rooms = (ids: readonly string[], ctx: CommandContext) => ctx.rooms.filter((r) => ids.includes(r.id));
const joinNames = (names: readonly string[]) => (names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

type Scoped = { scope: Scope; explicit: boolean; used: Set<number> } | Reply;

/** Which rooms the words mean: named rooms, "everywhere", the room being looked at, the only room that has such devices, or a question back. */
function scopeOf(words: readonly string[], ctx: CommandContext, kinds: readonly DeviceKind[], pick?: Pick, wantDevice = true): Scoped {
  const m = findRooms(words, ctx.rooms);
  if (pick) return { scope: pick.rooms, explicit: true, used: m.used };
  if (m.choices.length) {
    const group = m.choices[0];
    return {
      kind: "ask",
      question: `Which room do you mean: ${joinNames(group.map((r) => r.name))}?`,
      options: [...group.map((r) => ({ label: r.name, pick: { rooms: [...m.chosen.map((c) => c.id), r.id] } })), { label: "All of them", pick: { rooms: [...m.chosen, ...group].map((r) => r.id) } }],
    };
  }
  if (m.rooms.length) return { scope: m.rooms.map((r) => r.id), explicit: true, used: m.used };
  const text = words.join(" ");
  if (wantDevice && leftover(words, m.used).length) return { scope: "all", explicit: false, used: m.used }; // "the desk lamp": found by name, wherever it is
  if (wholeHome(words) || /\b(all|every|everything)\b/.test(text)) return { scope: "all", explicit: true, used: m.used };
  if (ctx.here) return { scope: [ctx.here], explicit: false, used: m.used };
  if (!wantDevice) return { scope: "all", explicit: false, used: m.used };
  const having = ctx.rooms.filter((r) => ctx.devices.some((d) => d.roomId === r.id && (!kinds.length || kinds.includes(d.kind))));
  if (having.length === 1) return { scope: [having[0].id], explicit: false, used: m.used };
  if (!having.length) return no("I could not find any of those in your plan. Link devices to furniture in Home Assistant mode first.");
  return {
    kind: "ask",
    question: "Which room?",
    options: [...having.map((r) => ({ label: r.name, pick: { rooms: [r.id] } })), { label: "Everywhere", pick: { rooms: "all" as const } }],
  };
}

const isReply = (s: Scoped): s is Reply => "kind" in s;

/** Words left once the filler, the kind words, the numbers and the room names are taken out: what the person called the device ("desk", "sofa"). */
function leftover(words: readonly string[], used: ReadonlySet<number>): string[] {
  return words.filter((w, i) => !used.has(i) && !FILLER.has(w) && !isKindWord(w) && !/^\d+(\.\d+)?$/.test(w) && !["half", "full", "max", "maximum", "celsius", "c"].includes(w));
}

const nameHas = (name: string, word: string) => wordsOf(normalise(name)).some((n) => sameWord(stem(n), stem(word)));

type Plan = { devices: SceneDevice[]; named: boolean };

/** The devices the words mean: of the kinds asked, in the rooms asked, narrowed by what the person called them. Null (with the reason) when none. */
function devicesFor(words: readonly string[], ctx: CommandContext, kinds: readonly DeviceKind[], scope: Scope, explicitRoom: boolean, used: ReadonlySet<number>): Plan | string {
  const left = leftover(words, used);
  let pool = ctx.devices.filter((d) => (!kinds.length || kinds.includes(d.kind)) && (left.length && !explicitRoom ? true : scope === "all" || (d.roomId !== null && scope.includes(d.roomId))));
  if (left.length) pool = pool.filter((d) => left.every((w) => nameHas(d.name, w) || nameHas(d.room, w)));
  if (!pool.length) {
    const what = left.length ? `"${left.join(" ")}"` : kinds.length ? kinds.map((k) => KIND_NOUN[k][1]).join(" or ") : "devices";
    const in_ = scope === "all" || (left.length && !explicitRoom) ? "" : ` in ${joinNames(rooms(scope, ctx).map((r) => r.name))}`;
    return `I could not find ${what}${in_}. Only devices linked to furniture in Home Assistant mode can be controlled.`;
  }
  return { devices: pool, named: left.length > 0 };
}

const where = (scope: Scope, ctx: CommandContext, named: boolean) => (named ? "" : scope === "all" ? " in the whole home" : ` in ${joinNames(rooms(scope, ctx).map((r) => r.name))}`);

function counts(devices: readonly SceneDevice[], named: boolean): string {
  if (named && devices.length <= 3) return joinNames(devices.map((d) => d.name));
  const kinds = [...new Set(devices.map((d) => d.kind))];
  return joinNames(kinds.map((k) => pluralise(devices.filter((d) => d.kind === k).length, KIND_NOUN[k])));
}

/** The reply for a list of steps: validated like the server does, with a plain sentence of what it will do. */
function run(summary: string, steps: SceneStep[], ctx: CommandContext, scene?: string): Reply {
  const actions = sceneActions({ steps });
  if (!actions.length) return no("There is nothing to do for that.");
  for (const batch of inBatches(actions)) {
    const checked = checkBatch({ actions: batch }, ctx.states);
    if (!checked.ok) return no(`Doshy cannot do that: ${checked.error}`);
  }
  return { kind: "run", summary, steps, actions, entities: [...new Set(steps.map((s) => s.entity))], ...(scene ? { scene } : {}) };
}

function amountOfKind(a: Amount | null, kind: "percent" | "degrees"): number | null {
  return a && (a.unit === kind || a.unit === null) ? a.value : null;
}

/** Everything that changes something. */
function act(words: readonly string[], ctx: CommandContext, pick?: Pick): Reply {
  if (DENIED.test(words.join(" "))) return { kind: "no", message: REFUSED, refused: true };
  const text = words.join(" ");
  let kinds = kindsIn(words);
  if (!kinds.length && /\b(door|doors|garage|gate|gates)\b/.test(text)) return { kind: "no", message: REFUSED, refused: true };
  const verb = words.find((w) => [...OPENERS, ...CLOSERS, "dim", "darken", "brighten", "set", "make", ...SWITCH_VERBS].includes(w));
  const onOff = onOffOf(words);
  const everything = /\b(everything|all devices)\b/.test(text);
  const warmer = words.find((w) => ["warmer", "hotter"].includes(w));
  const cooler = words.find((w) => ["cooler", "colder"].includes(w));
  const amount = amountOf(words);

  type Intent = "cover" | "dim" | "temp" | "power";
  let intent: Intent | null = null;
  const shutOff = words.includes("shut") && words[words.indexOf("shut") + 1] === "off";
  const direction = (() => {
    for (const w of words) {
      if (shutOff && w === "shut") continue;
      if (OPENERS.includes(w)) return "open";
      if (CLOSERS.includes(w)) return "close";
    }
    return null;
  })();
  if (direction && (kinds.includes("cover") || (!kinds.length && onOff === null))) intent = "cover";
  else if (words.some((w) => ["dim", "darken", "brighten"].includes(w)) || (kinds.includes("light") && amount && amount.unit !== "degrees" && (amount.unit === "percent" || verb === "set" || verb === "make"))) intent = "dim";
  else if (kinds.includes("climate") || warmer || cooler || (amount?.unit === "degrees") || (!kinds.length && (verb === "set" || verb === "make") && amount && amount.unit === null && amount.value >= 5 && amount.value <= 35)) intent = "temp";
  else if (onOff !== null) intent = "power";
  if (!intent) return no(HELP);

  if (intent === "cover") kinds = ["cover"];
  if (intent === "dim") kinds = ["light"];
  if (intent === "temp") kinds = ["climate"];
  if (intent === "power") {
    if (kinds.includes("cover")) return no('Curtains open and close. Say "open the curtains" or "close the curtains".');
    if (kinds.includes("climate")) return no('To change the heating, say a temperature, like "set living room to 21".');
    if (!kinds.length && !everything && !leftover(words, findRooms(words, ctx.rooms).used).length) return no(`What should I turn ${onOff ? "on" : "off"}? Name it, like "the bedroom lights" or "the TV".`);
    kinds = kinds.length ? kinds : everything ? ["light", "media", "fan"] : [];
  }

  const s = scopeOf(words, ctx, kinds.length ? kinds : ["light", "media", "fan", "switch"], pick);
  if (isReply(s)) return s;
  let found = devicesFor(words, ctx, kinds.length ? kinds : ["light", "media", "fan", "switch"], s.scope, s.explicit, s.used);
  // one thermostat heats the whole home: "set living room to 22" means that one, said out loud in the summary
  const lone = intent === "temp" ? ctx.devices.filter((d) => d.kind === "climate") : [];
  if (typeof found === "string" && lone.length === 1) found = { devices: lone, named: true };
  if (typeof found === "string") return no(found);
  const { devices } = found;
  const named = found.named || devices.length === 1; // a lone device is told by its name
  const at = where(s.scope, ctx, named);

  switch (intent) {
    case "power": {
      const on = onOff === true;
      const movable = devices.filter((d) => d.kind !== "cover" && d.kind !== "climate");
      if (!movable.length) return no(`I can switch lights, TVs, fans and plugs. ${HELP}`);
      return run(`Turn ${on ? "on" : "off"} ${counts(movable, named)}${at}`, movable.map((d) => ({ entity: d.entity, on })), ctx);
    }
    case "cover": {
      const pos = amountOfKind(amount, "percent");
      const position = pos !== null && amount?.unit === "percent" ? Math.min(100, pos) : direction === "open" ? 100 : 0;
      const word = position === 100 ? "Open" : position === 0 ? "Close" : "Set";
      return run(`${word} ${counts(devices, named)}${at}${position > 0 && position < 100 ? ` to ${position}% open` : ""}`, devices.map((d) => ({ entity: d.entity, position })), ctx);
    }
    case "dim": {
      const dimmable = devices.filter((d) => d.dimmable);
      if (!dimmable.length) return no(`None of those lights can be dimmed (they only switch on and off).`);
      const target = amountOfKind(amount, "percent") ?? (words.includes("brighten") ? 100 : 30);
      const level = Math.round(Math.min(100, Math.max(1, target)));
      const skipped = devices.length - dimmable.length;
      return run(`${words.includes("brighten") && amount === null ? "Brighten" : "Dim"} ${counts(dimmable, named)}${at} to ${level}%${skipped ? ` (${skipped} cannot dim and stay as they are)` : ""}`, dimmable.map((d) => ({ entity: d.entity, on: true, brightness: level })), ctx);
    }
    case "temp": {
      const steps: SceneStep[] = [];
      for (const d of devices) {
        const now = ctx.states[d.entity]?.attributes.temperature;
        const by = amountOfKind(amount, "degrees") ?? 1;
        const target = warmer || cooler ? (typeof now === "number" ? now + (warmer ? by : -by) : null) : amountOfKind(amount, "degrees");
        if (target === null) return no("Tell me the temperature, like \"set living room to 21\".");
        if (d.limits && (target < d.limits.min || target > d.limits.max)) return no(`${d.name} accepts ${d.limits.min} to ${d.limits.max}°. ${target}° is outside that.`);
        steps.push({ entity: d.entity, temperature: target });
      }
      const target = steps[0].temperature;
      const relative = warmer || cooler;
      const summary = relative ? `Make ${counts(devices, named)}${at} ${warmer ? "warmer" : "cooler"} (to ${steps.map((x) => `${x.temperature}°`).join(", ")})` : `Set ${counts(devices, named)}${at} to ${target}°`;
      return run(summary, steps, ctx);
    }
  }
}

/** Words of a question that are not names: what is asked about the state, not which device. */
const QUESTION_NOISE = ["window", "windows", "door", "doors", "closed", "temperature", "warm", "cold", "hot", "cool", "playing", "something", "currently", "right", "show", "tell", "list", "open", "state", "status"];

/** Read-only questions. */
function ask(words: readonly string[], ctx: CommandContext, pick?: Pick): Reply {
  const kinds = kindsIn(words);
  const contactWords = words.some((w) => ["window", "windows", "door", "doors"].includes(w));
  const temperature = words.some((w) => ["temperature", "warm", "cold", "hot", "degrees", "cool"].includes(w)) && !kinds.some((k) => k !== "climate");
  const open = words.some((w) => ["open", "closed", "shut"].includes(w));
  const s = scopeOf(words, ctx, kinds, pick, false);
  if (isReply(s)) return s;
  // Whatever is left after rooms, kinds and filler is a name ("desk lamp") or a place Doshy does not have ("garden"): never answer about the whole home for that
  const left = leftover(words, s.used).filter((w) => !QUESTION_NOISE.includes(w));
  const named = (name: string) => left.every((w) => nameHas(name, w));
  if (left.length && !ctx.devices.some((d) => named(d.name)) && !ctx.contacts.some((c) => named(`${c.name} ${c.room}`))) return no(`I do not know anything called "${left.join(" ")}" in your plan.`);
  const a = {
    states: ctx.states,
    rooms: ctx.rooms,
    devices: left.length ? ctx.devices.filter((d) => named(d.name)) : ctx.devices,
    contacts: left.length ? ctx.contacts.filter((c) => named(`${c.name} ${c.room}`)) : ctx.contacts,
  };
  const scope = left.length && !s.explicit ? "all" : s.scope;
  if (contactWords || (open && !kinds.length)) return { kind: "answer", text: answerContacts(words, scope, a) };
  if (temperature) return { kind: "answer", text: answerTemperature(scope, a) };
  if (kinds.length) return { kind: "answer", text: answerState(kinds.filter((k) => k !== "climate"), scope, a) };
  if (words.includes("on")) return { kind: "answer", text: answerState(["light", "media", "fan"], scope, a) };
  return no(HELP);
}

/** What the box makes of one line of text. `pick` is the answer to an earlier "which room?" (parse the same text again with it). */
export function parseCommand(text: string, ctx: CommandContext, pick?: Pick): Reply {
  const words = wordsOf(normalise(text));
  if (!words.length) return no(HELP);
  const scene = sceneFor(words, ctx);
  const question = QUESTION.test(words.join(" ")) || (text.trim().endsWith("?") && !/^(please |can you |could you )?(turn|switch|set|make|dim|open|close|run|start)\b/.test(words.join(" ")));
  if (!question && scene) {
    const steps = scene.steps.filter((s) => ctx.states[s.entity]);
    if (!steps.length) return no(`"${scene.name}" has nothing to do yet, or its devices are gone from Home Assistant. Open Scenes to fix it.`);
    return run(`Run the scene "${scene.name}" (${pluralise(steps.length, ["device", "devices"])})`, steps, ctx, scene.name);
  }
  return question ? ask(words, ctx, pick) : act(words, ctx, pick);
}
