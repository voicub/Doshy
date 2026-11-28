import { BufferGeometry, CapsuleGeometry, CircleGeometry, MeshBasicMaterial, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Height of the figure (m): a stylised, slightly small person, so it reads as a marker and not as a second piece of furniture. */
export const FIG_H = 1.1;
const BODY_R = 0.17;
const BODY_LEN = 0.5;
const HEAD_R = 0.14;
const DISC_R = 0.3;

let figure: BufferGeometry | null = null;
/** Capsule body and a sphere head as ONE geometry shared by every person (one draw call each); feet at y = 0. Built once, never disposed. */
export function figureGeometry(): BufferGeometry {
  if (!figure) {
    const body = new CapsuleGeometry(BODY_R, BODY_LEN, 4, 10);
    body.translate(0, BODY_R + BODY_LEN / 2, 0);
    const head = new SphereGeometry(HEAD_R, 12, 10);
    head.translate(0, FIG_H - HEAD_R, 0);
    figure = mergeGeometries([body, head].map((g) => g.toNonIndexed())) ?? new BufferGeometry();
    body.dispose();
    head.dispose();
  }
  return figure;
}

let disc: BufferGeometry | null = null;
/** A flat circle lying on the floor (the Eco and Light marker, and the soft shadow under a figure). */
export function discGeometry(): BufferGeometry {
  if (!disc) disc = new CircleGeometry(DISC_R, 20).rotateX(-Math.PI / 2);
  return disc;
}

/** A soft dark spot under a standing figure instead of a real shadow: no shadow pass has to run for somebody walking. Shared by everyone. */
export const spotMaterial = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
