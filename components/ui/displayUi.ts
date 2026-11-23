import { OPEN_DISPLAY_EVENT } from "@/lib/display";

/** Opens the Display settings from anywhere (menu row, command palette, hints). The sheet itself is mounted once by `DisplayHost`. */
export const openDisplaySettings = () => window.dispatchEvent(new Event(OPEN_DISPLAY_EVENT));
