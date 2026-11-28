// Records the turntable video: the camera turns once round the building (lib/snapshotVideo.ts) while `canvas.captureStream` feeds a MediaRecorder. Everything it changes is put back in
// `finally`: the camera and its controls, the render size, the frame pacing and the HUD. The camera is turned the way Rig's cinema drift turns it (about the controls' target, once
// per drawn frame, from inside the frame loop): Rig's own goal tween is a fixed 0.65 s move, too short for a spin, and a second controller is not wanted.
import { Vector3, type EventDispatcher, type OrthographicCamera } from "three";
import type { OrbitControls } from "three-stdlib";
import { isOrtho } from "@/components/scene/camera";
import { keepAlive } from "@/lib/framePacer";
import { sceneBridge } from "@/lib/snapshotBridge";
import { planSnapshotSize } from "@/lib/snapshotSize";
import { frameCount, orbitAngle, videoBitrate, VIDEO_FPS, VIDEO_PIXEL_BUDGET, type VideoFormat } from "@/lib/snapshotVideo";
import { liveScene, readGlLimits, viewSize } from "./snapshotCapture";
import { useRecordingUi } from "./recordingUi";
import { saveBlob } from "./saveBlob";

/** No frame for this long (ms) while recording: the view has stopped drawing (a screensaver, a lost graphics context). */
const STALL_MS = 3000;
const WATCH_MS = 250;
const UP = new Vector3(0, 1, 0);

export type RecordOptions = { seconds: number; ease: boolean; format: VideoFormat };
type Outcome = "done" | "cancel" | { error: string };

/** The orbit controls of the scene (drei's `makeDefault` puts them in the store as a bare event dispatcher). */
const isOrbit = (c: EventDispatcher | null): c is OrbitControls => c !== null && "target" in c && c.target instanceof Vector3 && "update" in c && typeof c.update === "function";

/** Whether this browser can record a canvas at all. */
export const canRecord = (): boolean => typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;

/**
 * Records one full turn. Resolves with the video, or null when it was cancelled; rejects with a plain-English message when it could not be made (the tab went to the
 * background, the view stopped drawing, the recorder failed). While it runs, `useRecordingUi` carries the progress.
 */
export async function recordTurntable({ seconds, ease, format }: RecordOptions): Promise<Blob | null> {
  if (!canRecord()) throw new Error("This browser cannot record video. Try Chrome, Edge, Firefox or Safari, or take a picture instead.");
  const state = liveScene();
  const camera = state.camera;
  const controls = state.controls;
  if (!isOrtho(camera) || !isOrbit(controls)) throw new Error("The 3D view is not ready. Close this and try again in a moment.");
  if (state.frameloop === "never") throw new Error("The 3D view is paused right now (the screensaver). Wake the screen and try again.");
  if (document.hidden) throw new Error("This tab is in the background. Bring it to the front and try again.");

  const { gl } = state;
  const canvas = gl.domElement;
  const saved = { ratio: gl.getPixelRatio(), position: camera.position.clone(), zoom: camera.zoom, target: controls.target.clone(), enabled: controls.enabled };
  const offset = saved.position.clone().sub(saved.target);
  const total = frameCount(seconds);
  const outcome = Promise.withResolvers<Outcome>();
  const ui = useRecordingUi.getState();
  const html = document.documentElement;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let onVisibility: (() => void) | null = null;
  let watch: number | undefined;

  try {
    // a very large (5K, or a phone's high ratio) canvas makes the encoder refuse the stream or the computer crawl: draw smaller while recording
    const size = planSnapshotSize(viewSize(state), saved.ratio, readGlLimits(state), VIDEO_PIXEL_BUDGET);
    if (size.ratio < saved.ratio) gl.setPixelRatio(size.ratio);
    stream = canvas.captureStream(VIDEO_FPS);
    recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: videoBitrate(canvas.width, canvas.height) });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onerror = () => outcome.resolve({ error: "The browser's video recorder stopped with an error. Try a shorter clip or a smaller window." });
    const stopped = Promise.withResolvers<void>();
    recorder.onstop = () => stopped.resolve();

    html.setAttribute("data-recording", "");
    controls.enabled = false;
    ui.begin(seconds, () => outcome.resolve("cancel"));
    let t0 = -1;
    let lastFrame = performance.now();
    let shown = 0;
    sceneBridge.onFrame = (s) => {
      const now = performance.now();
      lastFrame = now;
      if (t0 < 0) t0 = now;
      const p = (now - t0) / (seconds * 1000);
      if (p >= 1) return outcome.resolve("done"); // the last frame drawn was one step short of the full turn: the clip loops without a repeated frame
      keepAlive(false); // the camera is moving: the next frame is due at once (the pacer's own cap still applies)
      const turn = (orbitAngle(Math.min(p, 1 - 1 / total), ease) * Math.PI) / 180;
      s.camera.position.copy(saved.target).add(offset.clone().applyAxisAngle(UP, turn));
      s.camera.lookAt(saved.target);
      if (p - shown >= 0.01) useRecordingUi.getState().setProgress((shown = p));
    };
    watch = window.setInterval(() => {
      if (performance.now() - lastFrame > STALL_MS) outcome.resolve({ error: "Recording stopped because the 3D view stopped drawing." });
    }, WATCH_MS);
    onVisibility = () => document.hidden && outcome.resolve({ error: "Recording stopped because this tab went into the background (browsers pause drawing there). Keep it in front while it records." });
    document.addEventListener("visibilitychange", onVisibility);

    recorder.start(500);
    state.invalidate();
    const end = await outcome.promise;
    if (recorder.state !== "inactive") recorder.stop();
    await stopped.promise;
    if (end === "cancel") return null;
    if (end !== "done") throw new Error(end.error);
    const blob = new Blob(chunks, { type: format.mime.split(";")[0] });
    if (blob.size === 0) throw new Error("The video came out empty. Try again, or try another browser.");
    return blob;
  } finally {
    clearInterval(watch);
    if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
    sceneBridge.onFrame = null;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    html.removeAttribute("data-recording");
    restoreCamera(camera, controls, saved);
    gl.setPixelRatio(saved.ratio);
    state.advance(state.clock.elapsedTime, false); // show the normal picture straight away
    state.invalidate();
  }
}

type Saved = { position: Vector3; zoom: number; target: Vector3; enabled: boolean };

/** The camera back where it was: position, zoom, the point it looks at, and the owner's control of it. */
function restoreCamera(camera: OrthographicCamera, controls: OrbitControls, s: Saved) {
  controls.target.copy(s.target);
  camera.position.copy(s.position);
  camera.zoom = s.zoom;
  camera.lookAt(s.target);
  camera.updateProjectionMatrix();
  controls.enabled = s.enabled;
  controls.update();
}

const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

/** Records the clip and saves it as `fileName`; the outcome (saved, cancelled, or why it failed) goes to the progress bar's state. Never throws. */
export async function runTurntable(o: RecordOptions & { fileName: string }): Promise<void> {
  const ui = useRecordingUi.getState();
  try {
    const blob = await recordTurntable(o);
    if (!blob) return ui.dismiss();
    saveBlob(blob, o.fileName);
    ui.finish("done", `Saved ${o.fileName} (${megabytes(blob.size)}).`);
  } catch (e) {
    ui.finish("failed", e instanceof Error ? e.message : "The video could not be made.");
  }
}
