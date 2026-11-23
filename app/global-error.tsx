"use client";
import CrashScreen from "@/components/CrashScreen";

/** The same for a crash in the page shell itself (app/layout.tsx and what it mounts), which app/error.tsx cannot see. It replaces the whole document, so it styles itself. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#05070a", color: "#e6edf3", fontFamily: "system-ui, sans-serif" }}>
        <CrashScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
