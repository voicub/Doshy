/** A finger (coarse pointer) is the main input: targets grow to 44 px. */
export const isCoarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
