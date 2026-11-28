import { create } from "zustand";

/**
 * "Preview a date": the day of the year (0 = 1 January, up to 364) the garden is being shown on, or null for today. Never saved: a preview is a
 * look around, and a wall display must not wake up stuck in March.
 */
export const useSeasonPreview = create<{ day: number | null; set: (day: number | null) => void }>((set) => ({
  day: null,
  set: (day) => set({ day: day === null ? null : Math.min(364, Math.max(0, Math.round(day))) }),
}));
