"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ASSIST_DEFAULTS, cleanAssistSettings, type AssistSettings } from "./assist";
export const useAssistSettings = create<AssistSettings & { patch: (p: Partial<AssistSettings>) => void }>()(persist((set) => ({
  ...ASSIST_DEFAULTS,
  patch: (p) => set((s) => cleanAssistSettings({ ...s, ...p })),
}), { name: "housey-assist", merge: (raw, current) => ({ ...current, ...cleanAssistSettings(raw) }) }));
