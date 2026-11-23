import { create } from "zustand";
import { PILLAR_PRESETS, type PillarPreset } from "@/lib/pillars";

/** Which preset the Pillar tool drops next (not persisted: a new session starts with the first). */
export const usePillarUi = create<{ preset: string; set: (id: string) => void }>((set) => ({ preset: PILLAR_PRESETS[0].id, set: (preset) => set({ preset }) }));

export const presetOf = (id: string): PillarPreset => PILLAR_PRESETS.find((p) => p.id === id) ?? PILLAR_PRESETS[0];
