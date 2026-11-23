import assert from "node:assert/strict";
import { test } from "node:test";
import { bytesResponse } from "./bytesResponse.ts";

test("the body is the very same bytes, and status and headers are kept", async () => {
  const bytes = Uint8Array.from([1, 2, 3, 250]);
  const res = bytesResponse(bytes, { status: 201, headers: { "content-type": "model/gltf-binary", "content-length": "4" } });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("content-type"), "model/gltf-binary");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), bytes);
});

test("an empty body is fine", async () => {
  assert.equal((await bytesResponse(new Uint8Array(0)).arrayBuffer()).byteLength, 0);
});
