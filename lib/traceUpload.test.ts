import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_SOURCE_BYTES, PDF_MESSAGE, checkFile, fitSize, traceIdOf } from "./traceUpload.ts";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

test("a PDF gets the plain message, by type or by name", () => {
  assert.deepEqual(checkFile(file("plan.pdf", "application/pdf")), { ok: false, message: PDF_MESSAGE });
  assert.deepEqual(checkFile(file("PLAN.PDF", "")), { ok: false, message: PDF_MESSAGE });
});

test("pictures are accepted, an SVG is flagged as vector, other files are refused", () => {
  assert.deepEqual(checkFile(file("a.png", "image/png")), { ok: true, vector: false });
  assert.deepEqual(checkFile(file("IMG_1.HEIC", "")), { ok: true, vector: false }); // some browsers give no type
  assert.deepEqual(checkFile(file("a.svg", "image/svg+xml")), { ok: true, vector: true });
  assert.equal(checkFile(file("notes.txt", "text/plain")).ok, false);
});

test("a source file over 40 MB is refused, one at the limit is not", () => {
  assert.equal(checkFile(file("a.jpg", "image/jpeg", MAX_SOURCE_BYTES + 1)).ok, false);
  assert.equal(checkFile(file("a.jpg", "image/jpeg", MAX_SOURCE_BYTES)).ok, true);
});

test("a big picture is scaled down to 2048 on its longest side keeping its shape; a small one stays", () => {
  assert.deepEqual(fitSize(4096, 3072, 2048), { w: 2048, h: 1536 });
  assert.deepEqual(fitSize(3000, 6000, 2048), { w: 1024, h: 2048 });
  assert.deepEqual(fitSize(800, 600, 2048), { w: 800, h: 600 });
  assert.deepEqual(fitSize(2048, 100, 2048), { w: 2048, h: 100 });
});

test("a vector picture is drawn at the full size, and nothing collapses to zero", () => {
  assert.deepEqual(fitSize(300, 150, 2048, true), { w: 2048, h: 1024 });
  assert.deepEqual(fitSize(10000, 1, 2048), { w: 2048, h: 1 });
});

test("the stored id is trace- and 24 hex digits, which the resource store accepts", () => {
  const id = traceIdOf("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  assert.equal(id, "trace-0123456789abcdef01234567");
  assert.match(id, /^[A-Za-z0-9_-]{1,64}$/);
});
