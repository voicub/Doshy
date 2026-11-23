import type { ReactNode } from "react";

/** Uppercase micro-label: Geist Mono, wide tracking. */
export default function MonoLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`label ${className}`}>{children}</span>;
}
