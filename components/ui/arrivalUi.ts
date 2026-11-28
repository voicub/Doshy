"use client";
import { create } from "zustand";
import type { Choreography } from "@/lib/arrival";

type Kind = Choreography["kind"];
export const useArrivalUi = create<{ visible: boolean; kind: Kind; open: (kind?: Kind) => void; close: () => void }>((set) => ({
  visible: false, kind: "arrival",
  open: (kind = "arrival") => set({ visible: true, kind }),
  close: () => set({ visible: false }),
}));
