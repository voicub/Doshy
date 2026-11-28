import { create } from "zustand";
export const useSkyChartUi = create<{ open: boolean; show: () => void; close: () => void }>((set) => ({ open: false, show: () => set({ open: true }), close: () => set({ open: false }) }));
