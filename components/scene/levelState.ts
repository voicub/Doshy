import { createContext, useContext, useMemo } from "react";
import { useStore } from "@/lib/store";
import { sortedLevels } from "@/lib/levels";
import { useWalking } from "@/lib/walkStore";
import type { Level } from "@/lib/types";

/** Which storey a subtree belongs to: its walls, items and labels read this instead of the whole plan. */
export const LevelCtx = createContext<{ id: string; elevation: number; active: boolean }>({ id: "L0", elevation: 0, active: true });
export const useLevel = () => useContext(LevelCtx);

/** Cut-away lowers the walls of the storey being worked on only; the others stand at full height. A walker stands among walls at their full height. */
export function useCutaway() {
  const cut = useStore((s) => s.cutaway);
  const { active } = useContext(LevelCtx);
  const walking = useWalking();
  return cut && active && !walking;
}

type LevelVisibility = { levels: Level[]; activeId: string; visible: Record<string, boolean> };

/**
 * Which storeys are shown. Live view follows the level switcher (all / up to the active level / only it);
 * the edit views show the stack up to the active level so what is edited sits on top of what carries it.
 */
export function useLevelVisibility(): LevelVisibility {
  const levelsRaw = useStore((s) => s.plan.levels);
  const view = useStore((s) => s.view);
  const active = useStore((s) => s.activeLevel);
  const levelView = useStore((s) => s.levelView);
  const walking = useWalking(); // a walker sees every storey: the ceiling over their head is the floor above
  return useMemo(() => {
    const levels = sortedLevels({ levels: levelsRaw });
    const act = levels.find((l) => l.id === active) ?? levels[0];
    const visible: Record<string, boolean> = {};
    for (const l of levels) {
      const mode = walking ? "all" : view === "live" ? levelView : "upTo";
      visible[l.id] = mode === "all" || (mode === "only" ? l.id === act.id : l.elevation <= act.elevation + 1e-6);
    }
    return { levels, activeId: act.id, visible };
  }, [levelsRaw, view, active, levelView, walking]);
}
