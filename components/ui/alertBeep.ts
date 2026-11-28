// The optional alarm beep: two short tones. Browsers keep sound locked until the page has been touched, so the audio context is only made after a real touch, click or key press;
// before that (a wall display nobody has touched since it started) the beep is skipped, not queued. Never throws: the banner is the alert, the beep is a bonus.
let touched = false;
let ctx: AudioContext | null = null;

const TONES: readonly { hz: number; at: number }[] = [{ hz: 880, at: 0 }, { hz: 660, at: 0.24 }];
const TONE_S = 0.2;
const VOLUME = 0.25;

/** Start listening for the first real gesture. Returns the function that stops. */
export function watchForGesture(): () => void {
  const mark = () => { touched = true; };
  const events = ["pointerdown", "keydown"] as const;
  for (const e of events) window.addEventListener(e, mark, { capture: true, passive: true });
  return () => { for (const e of events) window.removeEventListener(e, mark, true); };
}

export function playBeep(): void {
  if (!touched) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
    const t0 = ctx.currentTime;
    for (const { hz, at } of TONES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = hz;
      // a quick ramp in and out: a hard start and stop clicks
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(VOLUME, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + TONE_S);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + TONE_S + 0.02);
    }
  } catch {
    // no audio device or the browser refused: stay silent
  }
}
