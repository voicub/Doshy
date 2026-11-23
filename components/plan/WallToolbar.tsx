"use client";
import { useMemo } from "react";
import { FENCE_STYLES } from "@/lib/fences";
import { WALLS } from "@/lib/materials";
import { swatchUrl } from "@/lib/textures";
import type { WallStyle } from "@/lib/types";
import { useWallUi } from "./wallUi";
import "./wallToolbar.css";

const CHOICES: WallStyle[] = ["plaster", ...FENCE_STYLES];

function Swatch({ id }: { id: WallStyle }) {
  const url = useMemo(() => (typeof document === "undefined" ? "" : swatchUrl(id)), [id]);
  return <i className="wt-pic" style={{ backgroundColor: WALLS[id].color, backgroundImage: url ? `url(${url})` : undefined }} aria-hidden />;
}

/** What the next wall is made of: a house wall, or a fence, garden wall or hedge. Shown above the dock while the Wall tool is active. */
export default function WallToolbar() {
  const chosen = useWallUi((s) => s.style);
  const choose = useWallUi((s) => s.setStyle);
  return (
    <aside className="wall-toolbar hud brackets" aria-label="What to draw">
      <div className="wt-gallery" role="group" aria-label="Wall or fence">
        {CHOICES.map((id) => (
          <button key={id} type="button" className="wt-choice" aria-pressed={id === chosen} title={id === "plaster" ? "House wall" : WALLS[id].label} onClick={() => choose(id)}>
            <Swatch id={id} />
            <span>{id === "plaster" ? "Wall" : WALLS[id].label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
