/** Hooks the pointer logic (`Controller`) offers to the DOM around it (the quick toolbar, the placement bar). Null while no controller is mounted. */
export const pickBridge: {
  cycleHere: (() => void) | null;
  /** Touch placement: put the piece being placed where its ghost stands. */
  confirmPlace: (() => void) | null;
} = { cycleHere: null, confirmPlace: null };
