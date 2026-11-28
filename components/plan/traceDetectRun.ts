import { detectJob, type Seg, type Sensitivity } from "@/lib/traceDetect";
import { readTracePixels, type TracePixels } from "./traceImage";

const SLICE_MS = 10; // work for this long, then let the browser draw and answer touches

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export type DetectResult = { ok: true; segs: Seg[] } | { ok: false; message: string };

/**
 * Looks for walls in the stored picture without freezing the screen: the work (lib/traceDetect.ts) is cut into small steps and the browser gets a turn
 * between slices. `signal` aborts it (the panel closing); `onProgress` hears 0..1. The picture's pixels are dropped as soon as the walls are found.
 */
export async function detectInPicture(resourceId: string, sensitivity: Sensitivity, signal: AbortSignal, onProgress: (done: number) => void): Promise<DetectResult> {
  let pixels: TracePixels | null;
  try {
    pixels = await readTracePixels(resourceId);
  } catch {
    return { ok: false, message: "The picture could not be read from the server." };
  }
  if (!pixels) return { ok: false, message: "The picture is not on the server any more. Choose it again." };
  const job = detectJob(pixels.data, pixels.w, pixels.h, sensitivity);
  while (!job.done) {
    const until = performance.now() + SLICE_MS;
    do job.step();
    while (!job.done && performance.now() < until);
    onProgress(job.progress);
    if (signal.aborted) return { ok: false, message: "" };
    await nextTask();
  }
  return { ok: true, segs: job.result() };
}
