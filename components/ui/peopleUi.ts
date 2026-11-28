import { create } from "zustand";

/** Whether the People sheet is open (the pencil on the people row and the command palette open it). */
export const usePeopleUi = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({ open: false, setOpen: (open) => set({ open }) }));
