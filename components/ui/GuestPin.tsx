"use client";
import { useEffect, useRef, useState } from "react";
import { sendPin } from "@/lib/guestApi";

const PIN_SHAPE = /^\d{4,8}$/;

/** The PIN prompt of a guest link. Wrong PINs are counted by the server (5 tries, then a 15 minute wait): the form says how many are left and holds still during the wait. */
export default function GuestPin({ token, onUnlocked }: { token: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const field = useRef<HTMLInputElement>(null);
  const waiting = waitUntil > now;

  useEffect(() => field.current?.focus(), []);
  useEffect(() => {
    if (!waitUntil) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waitUntil]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || waiting) return;
    if (!PIN_SHAPE.test(pin)) return setMessage("A PIN is 4 to 8 digits.");
    setBusy(true);
    setMessage("");
    const r = await sendPin(token, pin);
    setBusy(false);
    if (r.ok) return onUnlocked();
    setPin("");
    setMessage(r.message);
    if (r.retryAfter) {
      setNow(Date.now());
      setWaitUntil(Date.now() + r.retryAfter * 1000);
    }
    field.current?.focus();
  };

  return (
    <form className="hud guest-card" onSubmit={submit} autoComplete="off">
      <h1 className="guest-title">This view needs a PIN</h1>
      <p className="guest-note">Enter the PIN you were given with the link.</p>
      <label className="field">
        <span className="label">PIN</span>
        <input
          ref={field}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          aria-invalid={message !== ""}
          aria-describedby="guest-pin-msg"
          disabled={busy || waiting}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <p id="guest-pin-msg" className="field-note guest-msg" role="alert">{message}</p>
      <button type="submit" className="btn primary" disabled={busy || waiting || pin.length < 4}>{busy ? "Checking..." : "Open"}</button>
    </form>
  );
}
