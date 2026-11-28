// What the wall display asks of the camera (components/scene/Rig.tsx reads it every frame, components/WallDisplay.tsx writes it). A plain object, not a store:
// the camera reads it inside a frame callback and nothing in React needs to re-render when it changes.

/** `rate`: degrees per second the view turns round the home (0 = still). `snap`: turn to this compass azimuth (degrees, the camera's own) once, then clear. */
export const wallCam: { rate: number; snap: number | null } = { rate: 0, snap: null };

/** The azimuth the isometric camera looks from at corner `n` (0..3): the default view and then a quarter turn each. */
export const cornerAzimuth = (n: number): number => 45 + 90 * (((n % 4) + 4) % 4);

/** A quarter turn spread over the time a slide stays, so the next slide's corner is where this one ends. Degrees per second. */
export const orbitRate = (secs: number): number => (secs > 0 ? 90 / secs : 0);
