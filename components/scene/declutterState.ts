import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "@/lib/dbClient";

const storage = dbStorage("housey-declutter", "settings", 0);

/** The plain "Declutter" switch (TelemetryBar): on = labels keep out of each other's way, piles fold into numbered markers, calm sensors shrink to dots. Off = every label stays exactly over its device. */
export const useDeclutter = create<{ on: boolean; set: (on: boolean) => void }>()(
  persist((set) => ({ on: true, set: (on) => set({ on }) }), { name: "housey-declutter", storage: createJSONStorage(() => storage) }),
);
storage.bind(() => void useDeclutter.persist.rehydrate());
