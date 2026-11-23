import { create } from "zustand";

/**
 * What the real surroundings occupy, published by Surroundings for the garden's own scatter (SeasonGarden): the plants the garden would grow
 * inside a neighbour's walls are dropped, and its made-up trees give way when the real trees (mapped or found in the photo) are drawn.
 * `inside` is false for every point while no surroundings are shown.
 */
type SiteBlock = { inside: (x: number, z: number) => boolean; realTrees: boolean };

export const NO_BLOCK: SiteBlock = { inside: () => false, realTrees: false };
export const useSiteBlock = create<SiteBlock>(() => NO_BLOCK);
