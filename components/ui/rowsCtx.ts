import { createContext } from "react";

/** Inside the compact menu the dock's buttons render as labelled rows; `done` closes the menu after a row that opens something. Null on the regular dock. */
export const RowsCtx = createContext<{ done: () => void } | null>(null);
