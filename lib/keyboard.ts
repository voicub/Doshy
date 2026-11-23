// On-screen keyboard detection for touch screens: while someone types, the visible height shrinks. The HUD uses it (`data-kbd-open` on <html>) to hide docks and floating bars.
// Pure; the browser wiring is components/KioskTouch.tsx.

/** The tallest the viewport has been since the width last changed (a rotation or a window resize starts over). */
export function nextBaseline(prev: { width: number; height: number } | null, cur: { width: number; height: number }): { width: number; height: number } {
  return prev && prev.width === cur.width ? { width: cur.width, height: Math.max(prev.height, cur.height) } : cur;
}

/** The keyboard counts as open when a text field has focus and a fifth of the height (at most 150 px) is gone. */
export function keyboardOpen(baselineHeight: number, height: number, editing: boolean): boolean {
  return editing && baselineHeight - height >= Math.min(150, baselineHeight * 0.2);
}

type ElementLike = { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined;
const NO_KEYBOARD: Record<string, true> = { checkbox: true, radio: true, range: true, button: true, submit: true, reset: true, color: true, file: true, image: true, hidden: true };

/** Does focusing this element bring up a keyboard? Text-like inputs, textareas and contenteditable; not checkboxes, sliders or buttons. */
export function wantsKeyboard(el: ElementLike): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return !NO_KEYBOARD[(el.type ?? "text").toLowerCase()];
  return !!el.isContentEditable;
}

type FieldHints = Partial<Record<"autocomplete" | "autocapitalize" | "spellcheck" | "enterkeyhint", string>>;
const CODE_LIKE: Record<string, true> = { search: true, number: true, tel: true, url: true, email: true };

/**
 * What a text field should say about itself so the on-screen keyboard behaves: no history suggestions, no red spell-check lines, no capital first letter on search boxes and numbers,
 * and a sensible Enter key ("Search", "Go" in a form, "Done"). Only attributes the field does not already carry are returned, so a field that sets its own is left alone.
 * A global focus handler applies this (components/KioskTouch.tsx), so no panel has to repeat it.
 */
export function fieldHints(f: { tagName: string; type?: string; role?: string | null; inForm?: boolean }, has: (attr: string) => boolean): FieldHints {
  if (!wantsKeyboard(f)) return {};
  const area = f.tagName.toUpperCase() === "TEXTAREA";
  const type = (f.type ?? "text").toLowerCase();
  const search = type === "search" || f.role === "combobox";
  const want: FieldHints = {
    autocomplete: "off",
    spellcheck: area ? undefined : "false",
    autocapitalize: search || CODE_LIKE[type] ? "off" : undefined,
    enterkeyhint: area ? "enter" : search ? "search" : f.inForm ? "go" : "done",
  };
  const out: FieldHints = {};
  for (const [k, v] of Object.entries(want)) if (v !== undefined && !has(k)) out[k as keyof FieldHints] = v;
  return out;
}
