"use client";
import CrashScreen from "@/components/CrashScreen";

/** Catches a crash anywhere in the dashboard page: without this a thrown render error leaves the framework's blank error page until someone reloads. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <CrashScreen error={error} retry={retry} />;
}
