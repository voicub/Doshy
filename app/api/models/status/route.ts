export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the page whether real car models can be downloaded (never the token itself). */
export async function GET() {
  return Response.json({ tokenConfigured: !!process.env.SKETCHFAB_TOKEN }, { headers: { "Cache-Control": "no-store" } });
}
