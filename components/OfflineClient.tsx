"use client";
import { useEffect } from "react";
import { startOfflineWorker } from "@/lib/offlineWorker";
import OfflineChip from "./ui/OfflineChip";
import UpdateToast from "./ui/UpdateToast";

/** Registers the offline worker (production builds only, see lib/offlineWorker.ts) and draws its two bits of HUD: the offline chip and the new-version toast. */
export default function OfflineClient() {
  useEffect(() => {
    void startOfflineWorker();
  }, []);
  return (
    <>
      <OfflineChip />
      <UpdateToast />
    </>
  );
}
