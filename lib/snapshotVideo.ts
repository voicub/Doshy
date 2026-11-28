// Pure: the turntable video. When the camera is where (a full turn about the building, loop-seamless), which container the browser can record, how long, how many bits. The
// recording itself is components/ui/turntableRecord.ts. The node test runner loads this file directly.

export const VIDEO_FPS = 30;
export const VIDEO_SECONDS = { min: 6, max: 20, default: 10 } as const;
/** On a weak device recording is heavy: this is the length that is suggested there. */
export const VIDEO_SECONDS_WEAK = 6;

/** A length from the slider or a typed number: a whole number of seconds inside the allowed range (the default for anything that is not a number). */
export function clampSeconds(s: number): number {
  if (!Number.isFinite(s)) return VIDEO_SECONDS.default;
  return Math.min(VIDEO_SECONDS.max, Math.max(VIDEO_SECONDS.min, Math.round(s)));
}

/** Number of frames of a clip: the orbit is split into this many equal steps. */
export const frameCount = (seconds: number, fps: number = VIDEO_FPS): number => Math.max(1, Math.round(seconds * fps));

const smooth = (p: number): number => p * p * (3 - 2 * p);

/**
 * How far round the camera has turned (degrees, 0..360) at `progress` (0 = start, 1 = end of the clip). Constant speed by default; `ease` starts and ends gently (the smooth-step
 * curve Rig's room moves use too). Exactly 360 only at progress 1, which is the start again: draw frame i of n at progress i / n (see `angleAtFrame`) and the clip loops with no repeated frame.
 */
export function orbitAngle(progress: number, ease = false): number {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return 360 * (ease ? smooth(p) : p);
}

/** Frame `i` (0-based) of a clip of `n` frames: the last frame is one step short of a full turn, so the clip loops seamlessly. */
export const angleAtFrame = (i: number, n: number, ease = false): number => orbitAngle(i / Math.max(1, n), ease);

/** Containers to try, best first: MP4 (H.264) plays everywhere (phones, chat apps, Safari), then WebM. The browser says which of them it can record. */
export const MIME_PREFERENCE: readonly string[] = [
  "video/mp4;codecs=avc1.640028",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export type VideoFormat = { mime: string; ext: "mp4" | "webm"; label: string };

/** The first of `candidates` that `isSupported` accepts (null = the browser cannot record video at all). */
export function pickVideoFormat(isSupported: (mime: string) => boolean, candidates: readonly string[] = MIME_PREFERENCE): VideoFormat | null {
  const mime = candidates.find((m) => isSupported(m));
  if (!mime) return null;
  const mp4 = mime.startsWith("video/mp4");
  return { mime, ext: mp4 ? "mp4" : "webm", label: mp4 ? "MP4" : "WebM" };
}

const BITS_PER_PIXEL = 0.08; // per pixel and frame: a smooth picture with fine detail, not a screen recording of text
const MIN_BITRATE = 2_000_000;
const MAX_BITRATE = 16_000_000;

/** Bits per second to give the recorder for a picture of this size: the browser's own default is far too low for a picture this detailed. */
export const videoBitrate = (width: number, height: number, fps: number = VIDEO_FPS): number => {
  const px = width > 0 && height > 0 ? width * height : 0; // false for NaN too
  return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, px * fps * BITS_PER_PIXEL)));
};

/** Total pixels of a video frame; larger views are drawn smaller while recording (a 5K screen would make an encoder refuse the stream and a small computer crawl). */
export const VIDEO_PIXEL_BUDGET = 2_600_000;
