"use client";
import { create } from "zustand";
export const useAdvisorUi = create<{ n: number; open: boolean; show: () => void }>((set) => ({ n: 0, open: false, show: () => set((s) => ({ n: s.n + 1 })) }));
