"use client";
import { isRecord } from "@/lib/guards";

/** The slice of the browser's speech recognizer that the command box uses. */
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  /** Chromium 139+: recognise on this device only, so no audio goes to a speech service. */
  processLocally: boolean;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognizerCtor = new () => Recognizer;

const isCtor = (v: unknown): v is RecognizerCtor => typeof v === "function" && isRecord(v.prototype) && "processLocally" in v.prototype;

/**
 * The browser's speech recogniser, only when it can listen on this device (it says so with `processLocally`). Without that, a browser may send the audio to its
 * maker's speech service, so the microphone button is not offered at all: Doshy never sends your voice anywhere.
 */
function recogniser(): RecognizerCtor | null {
  const ctor: unknown = Reflect.get(window, "SpeechRecognition") ?? Reflect.get(window, "webkitSpeechRecognition");
  return isCtor(ctor) ? ctor : null;
}

export const voiceAvailable = (): boolean => typeof window !== "undefined" && recogniser() !== null;

const transcript = (e: unknown): { text: string; final: boolean } | null => {
  const list = isRecord(e) ? e.results : null;
  if (!list || typeof list !== "object" || !("length" in list) || typeof list.length !== "number") return null;
  let text = "";
  let final = true;
  for (let i = 0; i < list.length; i++) {
    const r: unknown = Reflect.get(list, i);
    const alt: unknown = r && typeof r === "object" ? Reflect.get(r, 0) : null;
    if (isRecord(alt) && typeof alt.transcript === "string") text += alt.transcript;
    if (isRecord(r) && r.isFinal === false) final = false;
  }
  return { text: text.trim(), final };
};

/** Listen for one phrase. `onText` gets what was heard so far; `onEnd` runs when listening stops (with a plain reason when it failed). Returns a stopper, or null when voice is not available. */
export function listen(onText: (text: string, final: boolean) => void, onEnd: (problem?: string) => void): (() => void) | null {
  const Ctor = recogniser();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = document.documentElement.lang || "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.processLocally = true;
  let problem: string | undefined;
  rec.onresult = (e) => {
    const t = transcript(e);
    if (t) onText(t.text, t.final);
  };
  rec.onerror = (e) => {
    const code = isRecord(e) && typeof e.error === "string" ? e.error : "";
    problem = code === "not-allowed" ? "The microphone is blocked for this page." : code === "language-not-supported" ? "This browser has no offline speech for your language, so the microphone stays off." : code === "no-speech" || code === "aborted" ? undefined : "The microphone did not work.";
  };
  rec.onend = () => onEnd(problem);
  try {
    rec.start();
  } catch {
    return null;
  }
  return () => rec.stop();
}
