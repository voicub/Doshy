"use client";
import { create } from "zustand";
import type { Board } from "@/lib/maintenanceBoard";

export const MAINTENANCE_EVENT = "housey:maintenance";
export const openMaintenance = (taskId?: string) => document.dispatchEvent(new CustomEvent(MAINTENANCE_EVENT, { detail: { taskId } }));

export const useMaintenanceUi = create<{
  n: number; open: boolean; taskId?: string; board: Board;
  show: (taskId?: string) => void;
}>((set) => ({
  n: 0, open: false, board: { items: [], hidden: [], counts: { now: 0, soon: 0, later: 0, healthy: 0 } },
  show: (taskId) => set((s) => ({ n: s.n + 1, taskId })),
}));
