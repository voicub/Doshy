import { create } from "zustand";

/** Which room's device sheet is open (null = closed). Opened from a room chip in the 3D scene and from the room rail. */
export const useRoomSheet = create<{ room: string | null; open: (roomId: string) => void; close: () => void }>((set) => ({
  room: null,
  open: (room) => set({ room }),
  close: () => set({ room: null }),
}));
