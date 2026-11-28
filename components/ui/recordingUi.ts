import { create } from "zustand";

/**
 * What the small progress bar (SnapshotProgress.tsx) shows while the turntable video is recorded, and afterwards what came of it. The Share dialog closes while recording, so this
 * state lives outside it: ShareHost mounts the bar when `phase` is not idle.
 */
type RecordingUi = {
  phase: "idle" | "recording" | "done" | "failed";
  /** 0..1 while recording. */
  progress: number;
  /** The length of the clip, for the "3 s of 10 s" text. */
  seconds: number;
  /** Plain-English result once the phase is done or failed. */
  message: string;
  /** Stops the recording and throws the clip away; null when nothing is recording. */
  cancel: (() => void) | null;
  begin: (seconds: number, cancel: () => void) => void;
  setProgress: (progress: number) => void;
  finish: (phase: "done" | "failed", message: string) => void;
  /** Hides the bar after its result was read. */
  dismiss: () => void;
};

export const useRecordingUi = create<RecordingUi>()((set) => ({
  phase: "idle",
  progress: 0,
  seconds: 0,
  message: "",
  cancel: null,
  begin: (seconds, cancel) => set({ phase: "recording", progress: 0, seconds, message: "", cancel }),
  setProgress: (progress) => set({ progress }),
  finish: (phase, message) => set({ phase, message, cancel: null, progress: phase === "done" ? 1 : 0 }),
  dismiss: () => set({ phase: "idle", message: "", cancel: null, progress: 0 }),
}));
