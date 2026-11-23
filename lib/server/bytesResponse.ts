// A Response around bytes already in memory (a downloaded 3D model, a stored file). `new Response(bytes)` and `new Response(new Blob([bytes]))` both
// copy them first (~25-35 ms and a second copy in memory for a 40 MB model); a one-chunk stream hands the same bytes to the socket as they are.
// The caller must not change `bytes` afterwards.
export function bytesResponse(bytes: Uint8Array, init: ResponseInit = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, init);
}
