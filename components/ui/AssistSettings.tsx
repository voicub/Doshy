"use client";
import { useAssistSettings } from "@/lib/assistStore";
export default function AssistSettings() {
  const settings = useAssistSettings();
  return <section className="disp-sec">
    <h3 className="label disp-h">Home Assistant Assist</h3>
    <label className="hint">Ask Home Assistant when Doshy does not understand
      <select aria-label="Ask Home Assistant when Doshy does not understand" value={settings.handoff} onChange={(e) => settings.patch({ handoff: e.target.value === "never" ? "never" : "ask" })}>
        <option value="ask">Ask first</option><option value="never">Never</option>
      </select>
    </label>
    <p className="hint">Doshy's own commands still wait for Confirm. Assist only runs after you explicitly ask it, and Home Assistant can act immediately.</p>
    <label className="hint"><input type="checkbox" checked={settings.speak} onChange={(e) => settings.patch({ speak: e.target.checked })} /> Read Assist answers aloud on this device (off by default)</label>
  </section>;
}
