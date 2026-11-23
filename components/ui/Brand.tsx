"use client";

import "./Brand.css";

export type HaStatus = "loading" | "online" | "offline";
const TEXT: Record<HaStatus, string> = { loading: "linking", online: "online", offline: "offline" };
const CLASS: Record<HaStatus, string> = { loading: "wait", online: "ok", offline: "err" };

export default function Brand({ status, entities }: { status: HaStatus; entities: number }) {
  return (
    <div className="brand">
      <div className="brand-row">
        <span className="reactor" aria-hidden />
        <h1 className="wordmark">DOSHY</h1>
      </div>
      <div className={`ha ${CLASS[status]}`} role="status" aria-label={`Home Assistant ${TEXT[status]}`}>
        <i className="dot" />
        <span>{`HA ${TEXT[status]}`}</span>
        {status === "online" && <span>{`${entities} ent`}</span>}
      </div>
    </div>
  );
}
