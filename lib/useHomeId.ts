"use client";
// React hook over lib/haHome.ts. Kept apart so haHome.ts (imported by server-side modules such as lib/stats.ts) never pulls React into a server bundle.
import { useSyncExternalStore } from "react";
import { currentHome, onHomeChange } from "./haHome";

/** The connection id of the home on screen (null = main). */
export const useHomeId = (): string | null => useSyncExternalStore((cb) => onHomeChange(cb), currentHome, () => null);
