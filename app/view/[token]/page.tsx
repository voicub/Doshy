import type { Metadata } from "next";
import GuestEntry from "@/components/ui/GuestEntry";

// The guest page (docs/sharing.md): never indexed, never given a Referer. The same headers are also set by proxy.ts on every answer for /view and /api/guest.
export const metadata: Metadata = { title: "Doshy", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestEntry token={token} />;
}
