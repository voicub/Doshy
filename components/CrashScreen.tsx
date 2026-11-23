"use client";
import { useCallback, useEffect, useRef } from "react";
import { CRASH_QUIET_MS, crashRetryMs, nextStreak, type Streak } from "@/lib/recover";
import { useStore } from "@/lib/store";
import { GlNotice } from "./scene/GlStatus";

let streak: Streak | null = null; // module level: the screen is thrown away and built again on every try

/** What replaces the dashboard when it crashed (a reading it could not draw, a bug): plain words, and it starts again by itself, so a wall display never sits on a blank page. */
export default function CrashScreen({ error, retry }: { error: unknown; retry: () => void }) {
  const again = useRef(retry);
  again.current = retry;
  // The readings are dropped first: nothing polls while this screen is up, so a reading that made the dashboard crash would crash it again on the spot; the fresh poll brings new ones.
  const startAgain = useCallback(() => {
    useStore.setState({ states: {} });
    again.current();
  }, []);
  useEffect(() => {
    console.error("housey: this screen crashed and will start again", error);
    streak = nextStreak(streak, Date.now(), CRASH_QUIET_MS);
    const timer = setTimeout(startAgain, crashRetryMs(streak.n));
    return () => clearTimeout(timer);
  }, [error, startAgain]);
  return (
    <div className="crash-screen">
      <GlNotice title="Something went wrong" text="This screen hit a problem and is starting again by itself. If it keeps coming back, reload the page." action="Start again" onAction={startAgain} />
    </div>
  );
}
