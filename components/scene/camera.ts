import type { Camera, OrthographicCamera } from "three";

/** The scene camera is orthographic (zoom = pixels per metre); this narrows the generic `Camera` the store hands out. */
export const isOrtho = (c: Camera): c is OrthographicCamera => "isOrthographicCamera" in c && c.isOrthographicCamera === true;
