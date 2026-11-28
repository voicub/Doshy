import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TRACE_B64, readTraceImage, traceMimeOf } from "./planTraceFile.ts";

const trace = { resourceId: "trace-0123456789abcdef01234567", w: 800, h: 600, x: 0, y: 0, scale: 0.01, rotation: 0, opacity: 0.5, locked: false };
const png = { mime: "image/png", b64: "iVBORw0KGgo=" };

test("a good block comes back with the plan's own resource id", () => {
  assert.deepEqual(readTraceImage(png, trace), { id: "trace-0123456789abcdef01234567", mime: "image/png", b64: "iVBORw0KGgo=" });
});

test("a file made elsewhere with another kind of id still restores under the plan's own id, so the plan re-links", () => {
  assert.equal(readTraceImage(png, { ...trace, resourceId: "my_floor-plan-1" })?.id, "my_floor-plan-1");
});

test("nothing to restore without a usable trace in the plan", () => {
  assert.equal(readTraceImage(png, undefined), null);
  assert.equal(readTraceImage(png, { ...trace, resourceId: "../etc/passwd" }), null);
  assert.equal(readTraceImage(png, { ...trace, w: 0 }), null);
});

test("only the stored image types are accepted, whatever the case or parameters of the header", () => {
  for (const mime of ["image/svg+xml", "text/html", "application/pdf", "", 5, undefined]) assert.equal(readTraceImage({ ...png, mime }, trace), null, String(mime));
  assert.equal(traceMimeOf("Image/JPEG; charset=binary"), "image/jpeg");
  assert.equal(traceMimeOf("image/webp"), "image/webp");
  assert.equal(traceMimeOf("image/svg+xml"), null);
  assert.equal(traceMimeOf(null), null);
});

test("the bytes must be well-formed base64 and no bigger than the server accepts", () => {
  for (const b64 of ["", "abc", "ab!d", "AAAA AAAA", "=AAA", 5, null, undefined]) assert.equal(readTraceImage({ mime: "image/png", b64 }, trace), null, String(b64));
  assert.ok(readTraceImage({ mime: "image/png", b64: "A".repeat(MAX_TRACE_B64) }, trace));
  assert.equal(readTraceImage({ mime: "image/png", b64: "A".repeat(MAX_TRACE_B64 + 4) }, trace), null);
});

test("anything that is not a block is ignored", () => {
  for (const block of [null, undefined, "x", 5, [], {}]) assert.equal(readTraceImage(block, trace), null);
});
