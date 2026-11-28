/**
 * The real-sky light as the frame loop needs it (written by HdriEnv, read by SkyDriver every frame): while `on`, SkyDriver sets the scene's environment strength from
 * the picture's own setting instead of the procedural sky's. Not React state: a drifting daylight never re-renders anything.
 */
export const hdriLive = { on: false, studio: true, intensity: 1 };
