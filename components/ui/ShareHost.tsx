"use client";
import dynamic from "next/dynamic";
import { useRecordingUi } from "./recordingUi";
import { useShareUi } from "./shareUi";

// loaded the first time the dialog opens: the wall display never downloads it
const ShareSheet = dynamic(() => import("./ShareSheet"));
// the progress bar of a turntable recording: the dialog is closed by then, so it lives here
const SnapshotProgress = dynamic(() => import("./SnapshotProgress"));

/** Shows the Share dialog when something asked for it (the dock's Share button, the command palette, My pieces, a plan's menu), and the progress of a recording. */
export default function ShareHost() {
  const open = useShareUi((s) => s.page !== null);
  const recording = useRecordingUi((s) => s.phase !== "idle");
  return (
    <>
      {open && <ShareSheet />}
      {recording && <SnapshotProgress />}
    </>
  );
}
