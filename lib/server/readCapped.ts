// Read a body into one buffer, giving up (null) as soon as it passes `max` bytes, without ever holding more than the bytes plus some slack.
// Every place that takes a body from the network (uploads, camera stills, tiles, model downloads) uses this one reader.
const FIRST_GUESS = 64 * 1024;

/**
 * `sizeHint` is the announced length (Content-Length) when there is one: with it the buffer is allocated once and filled, with no list of chunks and no
 * second copy. A missing or wrong hint only costs a few doublings; the cap is enforced on the bytes actually read, never on the hint.
 * The result is a view that may sit in a slightly larger buffer when the hint was too big: use its `byteOffset` and `length`, not its `.buffer`.
 */
export async function readCapped(body: ReadableStream<Uint8Array>, max: number, sizeHint = 0): Promise<Uint8Array<ArrayBuffer> | null> {
  let out = new Uint8Array(Math.min(max, Math.max(sizeHint > 0 ? sizeHint : FIRST_GUESS, 1)));
  let size = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const end = size + value.byteLength;
    if (end > max) {
      await reader.cancel();
      return null;
    }
    if (end > out.length) {
      const grown = new Uint8Array(Math.min(max, Math.max(out.length * 2, end)));
      grown.set(out.subarray(0, size));
      out = grown;
    }
    out.set(value, size);
    size = end;
  }
  return out.subarray(0, size);
}
