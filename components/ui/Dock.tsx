"use client";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/guards";
import { useVp } from "@/lib/useVp";
import { useStore, type View } from "@/lib/store";
import { useChromeUi } from "./chromeUi";
import CompactMenu from "./CompactMenu";
import { FurnitureActions, HaActions, LiveActions, PlanActions, SettingsActions, type DockPanels } from "./DockActions";
import { CompactBar, ModeSwitch, MODES, Sep, TOOLS } from "./DockParts";
import { readPlanFile } from "./planIO";
import "./Dock.css";

// The tool list is part of the dock's public surface (hotkeys and the compact edit strip read it).
export { TOOLS };

type Props = DockPanels & {
  onPalette: () => void;
  onHelp: () => void;
  /** compact layout (tiny and small screens): a bottom bar with the four modes and More, which opens the menu sheet */
  compact: boolean;
};

const MESSAGE_MS = 6000;

/** The platform's modifier key name, for shortcut hints ("CMD" until mounted, so the server markup is stable). */
function useModKey() {
  const [mod, setMod] = useState("CMD");
  useEffect(() => {
    setMod(/Mac|iPhone|iPad/.test(navigator.platform) ? "CMD" : "CTRL");
  }, []);
  return mod;
}

/** The dock's toast line: an error (clears itself) or the current mode's intro (shown for a few seconds after a mode change). */
function useDockMessages(view: View) {
  const [error, setError] = useState<string | null>(null);
  const [intro, setIntro] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), MESSAGE_MS);
    return () => clearTimeout(t);
  }, [error]);
  // each mode introduces itself for a few seconds
  useEffect(() => {
    setIntro(MODES[view].hint || null);
    const t = setTimeout(() => setIntro(null), MESSAGE_MS);
    return () => clearTimeout(t);
  }, [view]);
  return { error, setError, intro };
}

export default function Dock(props: Props) {
  const { onPalette, onHelp, compact } = props;
  const view = useStore((s) => s.view);
  const tool = useStore((s) => s.tool);
  const setPlan = useStore((s) => s.setPlan);
  const menuOpen = useChromeUi((s) => s.menu);
  const file = useRef<HTMLInputElement>(null);
  const mod = useModKey();
  const { error, setError, intro } = useDockMessages(view);

  const importPlan = async (f: File) => {
    try {
      setPlan(await readPlanFile(f));
      setError(null);
    } catch (e) {
      setError(`Invalid plan file: ${errorMessage(e)}`);
    }
  };

  // the 3D edit layer (Furniture and HA modes) draws its own hint line, so only Plan mode and errors toast from here
  const toolHint = view === "plan" && tool !== "select" ? TOOLS.find((t) => t.tool === tool)?.hint : undefined;
  const hint = error ?? (view === "plan" ? (toolHint ?? intro) : undefined) ?? undefined;

  const actions = (
    <>
      {view === "live" && <LiveActions {...props} />}
      {view === "plan" && <PlanActions {...props} mod={mod} onImport={() => file.current?.click()} />}
      {view === "furniture" && <FurnitureActions {...props} mod={mod} />}
      {view === "ha" && <HaActions {...props} />}
    </>
  );
  const settings = <SettingsActions {...props} mod={mod} onPalette={onPalette} />;

  /** On a 7 inch screen the edit modes keep their tools, undo and hints in the EditStrip above this bar: the menu then only carries settings. */
  const editStrip = useVp().vp !== "regular" && view !== "live";
  return (
    <>
      {hint && view !== "live" && !editStrip && (
        <div className={`dock-hint hud ${error ? "err" : ""}`} role={error ? "alert" : "status"}>{hint}</div>
      )}
      {compact ? (
        <>
          <CompactBar />
          {menuOpen && <CompactMenu actions={editStrip ? null : actions} settings={settings} onHelp={onHelp} />}
        </>
      ) : (
        <nav className="dock hud brackets" aria-label={`${MODES[view].label} tools`}>
          <ModeSwitch />
          <Sep />
          {actions}
          <Sep />
          {settings}
        </nav>
      )}
      <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importPlan(f); }} />
    </>
  );
}
