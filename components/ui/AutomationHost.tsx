"use client";
import { AutomationSheet } from "../lazyPanels";
import { useAutomationUi } from "./automationUi";

/** Shows the automation sheet when something asked for it ("Make it do something..." on a device, the palette, the Scenes panel); it loads the first time. */
export default function AutomationHost() {
  const open = useAutomationUi((s) => s.open);
  return open ? <AutomationSheet /> : null;
}
