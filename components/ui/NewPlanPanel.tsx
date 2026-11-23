"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { firstLevelId } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { TEMPLATES, type Template } from "@/lib/templates";
import { useVp } from "@/lib/useVp";
import HudPanel from "./HudPanel";
import MonoLabel from "./MonoLabel";
import { ReplaceConfirm, TemplateCard } from "./NewPlanParts";
import "./newPlan.css";
import "./compactPanels.css";

/** Start a new building: pick a template, confirm that it replaces the current plan (with a chance to export it first), done. */
export default function NewPlanPanel({ onClose }: { onClose: () => void }) {
  const cards = useMemo(() => TEMPLATES.map((t) => ({ t, plan: t.build() })), []);
  const compact = useVp().vp !== "regular";
  const [picked, setPicked] = useState<Template | null>(null);
  const [marked, setMarked] = useState<Template | null>(null); // compact screens: a tap marks a card, "Use this template" in the sticky footer goes on
  const [exported, setExported] = useState(false);
  const back = useRef<string | null>(null); // card to refocus when the confirmation closes

  useEffect(() => {
    if (!picked && back.current) document.getElementById(`np-${back.current}`)?.focus();
  }, [picked]);

  const choose = (t: Template) => {
    back.current = t.id;
    setExported(false);
    setPicked(t);
  };

  const mark = (t: Template) => {
    back.current = t.id;
    setMarked(t);
  };

  const apply = (t: Template) => {
    const plan = t.build();
    const s = useStore.getState();
    s.setPlan(plan); // one undo step brings the old plan back
    // nothing may point at the old plan: first level, no selection, whole building, overview camera
    s.setActiveLevel(firstLevelId(plan));
    s.setLevelView("all");
    s.setFocusRoom(null);
    s.setTool("select");
    onClose();
  };

  return (
    <HudPanel title="New plan" meta={`${TEMPLATES.length} templates`} onClose={onClose} className="drawer new-plan">
      {picked ? (
        <ReplaceConfirm picked={picked} compact={compact} exported={exported} onExported={() => setExported(true)} onReplace={() => apply(picked)} onBack={() => setPicked(null)} />
      ) : (
        <>
          <MonoLabel>Start a building from scratch</MonoLabel>
          <ul className="np-list" aria-label="Templates">
            {cards.map(({ t, plan }) => <TemplateCard key={t.id} t={t} plan={plan} compact={compact} isMarked={marked?.id === t.id} onPick={() => (compact ? mark(t) : choose(t))} />)}
          </ul>
          {compact && (
            <footer className="np-foot">
              <button type="button" className="btn primary" disabled={!marked} onClick={() => marked && choose(marked)}>{marked ? "Use this template" : "Pick a template"}</button>
            </footer>
          )}
        </>
      )}
    </HudPanel>
  );
}
