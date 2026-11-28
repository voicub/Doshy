import { fetchResourceFile, fetchResources, putResource } from "@/lib/dbApi";
import { fromBase64, toBase64 } from "@/lib/modelStore";
import type { PlanFileParts } from "@/lib/planFile";
import { TRACE_NOTES, readTraceImage, traceMimeOf, type TraceImageBlock } from "@/lib/planTraceFile";
import { sanitizeTrace, withTrace } from "@/lib/trace";
import type { Plan } from "@/lib/types";

/** The plan's floor plan image for its file, or null when it has none or the server cannot give it now (the file is then still a good plan; opening it says the picture is missing). */
export async function traceImageFor(plan: Plan): Promise<TraceImageBlock | null> {
  const trace = sanitizeTrace(plan.trace);
  if (!trace) return null;
  try {
    const file = await fetchResourceFile(trace.resourceId);
    const mime = file && traceMimeOf(file.mime);
    return file && mime ? { mime, b64: toBase64(file.buf) } : null;
  } catch {
    return null;
  }
}

/** Puts the picture back on this server unless it is already there. Null when the plan can show it, else the plain reason it cannot. */
async function putBack(plan: Plan, block: unknown): Promise<string | null> {
  const trace = sanitizeTrace(plan.trace);
  if (!trace) return null;
  try {
    if ((await fetchResources("image")).resources.some((r) => r.id === trace.resourceId)) return null; // never overwrites a stored file
    const image = readTraceImage(block, plan.trace);
    if (!image) return TRACE_NOTES.missing;
    await putResource({ id: image.id, kind: "image", mime: image.mime, name: "Floor plan image", meta: { use: "trace", w: trace.w, h: trace.h } }, fromBase64(image.b64));
    return null;
  } catch {
    return TRACE_NOTES.failed;
  }
}

/** A plan file's plan with its floor plan picture restored on this server. When that is not possible the plan comes back without `trace` and `note` says why: it must still load. */
export async function restoreTrace(parts: PlanFileParts): Promise<{ plan: Plan; note: string | null }> {
  const note = await putBack(parts.plan, parts.traceImage);
  return note ? { plan: withTrace(parts.plan, null), note } : { plan: parts.plan, note: null };
}
