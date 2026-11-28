"use client";
import { PlayIcon } from "@phosphor-icons/react";
import { pinnedIn } from "@/lib/scenes";
import { useStore } from "@/lib/store";
import { runScene } from "./scenesRun";

/** The scenes pinned to a room (in the scene editor, "Show this scene on room cards"): one button each, on the room's device sheet. */
export default function PinnedScenes({ roomId }: { roomId: string }) {
  const plan = useStore((s) => s.plan);
  const scenes = pinnedIn(plan, roomId);
  if (!scenes.length) return null;
  return (
    <div className="eb-chips" role="group" aria-label="Scenes for this room">
      {scenes.map((s) => (
        <button key={s.id} type="button" className="btn" onClick={() => void runScene(s)}><PlayIcon size={12} weight="fill" /> {s.name}</button>
      ))}
    </div>
  );
}
