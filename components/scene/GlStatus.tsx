"use client";
import { Component, type ReactNode } from "react";
import "./glStatus.css";

/** Plain-words card over the 3D view when its graphics connection is gone (a wall display left on for months will meet this one day). */
export function GlNotice({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="gl-status" role="alert">
      <div className="gl-card hud">
        <h2 className="gl-title">{title}</h2>
        <p className="gl-text">{text}</p>
        <button type="button" className="btn primary gl-btn" onClick={onAction}>{action}</button>
      </div>
    </div>
  );
}

type Props = { children: ReactNode; /** Rebuild the view from scratch (a new canvas, a new graphics context). */ onRetry: () => void };

/** Catches a canvas that could not start (the browser refused a graphics context) and shows a card with a retry instead of an empty page. */
export class GlGuard extends Component<Props, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <GlNotice
        title="The 3D view could not start"
        text="Your browser could not set up its graphics. Try again. If it keeps failing, restart the browser, or pick Eco under Graphics."
        action="Try again"
        onAction={() => {
          this.setState({ failed: false });
          this.props.onRetry();
        }}
      />
    );
  }
}
