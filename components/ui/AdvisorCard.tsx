"use client";
import { useState } from "react";
import type { Advice } from "@/lib/advisor";
import { SeededAutomationBuilder } from "./AutomationBuilder";
import { useAdvisorReminders } from "./advisorReminderStore";

export default function AdvisorCard({ advice }: { advice: Advice }) {
  const [routine, setRoutine] = useState(false);
  const [created, setCreated] = useState(false);
  const reminders = useAdvisorReminders((s) => s.reminders);
  const remind = useAdvisorReminders((s) => s.remind);
  const reminded = reminders.some((r) => r.id === advice.id && !r.delivered);
  return <article className="advisor-card">
    <h3>{advice.title}</h3><p>{advice.detail}</p>
    <details><summary>Why?</summary><ul>{advice.why.map((why) => <li key={why}>{why}</li>)}</ul></details>
    <div className="advisor-actions">
      {advice.remindAt !== null && advice.remindAt > Date.now() && <button className="btn" type="button" disabled={reminded} onClick={() => remind(advice)}>{reminded ? "Reminder saved" : "Remind me"}</button>}
      {advice.routine && !created && <button className="btn" type="button" aria-expanded={routine} onClick={() => setRoutine((v) => !v)}>{routine ? "Cancel routine" : "Make it a routine"}</button>}
    </div>
    {reminded && <p className="field-note" role="status">The inbox will remind you while this dashboard is open. Nothing runs automatically.</p>}
    {routine && advice.routine && !created && <SeededAutomationBuilder seed={advice.routine} onCreated={() => { setCreated(true); setRoutine(false); }} />}
    {created && <p role="status">Routine created in Home Assistant. Manage it in Automations.</p>}
  </article>;
}
