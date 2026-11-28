"use client";
import { useMemo } from "react";
import { cleanMdiBody, type MdiIcon } from "@/lib/mdi";

/**
 * A Material Design icon as an inline SVG in the text colour (so it follows the marker's state colour and the theme). The body is checked again here, wherever it came from (the plan, the
 * saved cache, a download): only the shapes lib/mdi.ts allows are ever drawn. A body that does not pass draws nothing.
 */
export default function MdiGlyph({ icon, size = 16, className }: { icon: MdiIcon; size?: number | string; className?: string }) {
  const body = useMemo(() => cleanMdiBody(icon.body), [icon.body]);
  if (!body) return null;
  return <svg className={className} width={size} height={size} viewBox={`0 0 ${icon.width} ${icon.height}`} fill="currentColor" aria-hidden focusable="false" dangerouslySetInnerHTML={{ __html: body }} />;
}
