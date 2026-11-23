import type { View } from "@/lib/store";
import "./Atmosphere.css";

/** Cheap CSS-only film layers over the canvas: faint scanlines, corner vignette, hairline sweep on view change. */
export default function Atmosphere({ view }: { view: View }) {
  return (
    <div className="atm" aria-hidden>
      <i className="atm-scan" />
      <i className="atm-vig" />
      <i key={view} className="atm-sweep" />
    </div>
  );
}
