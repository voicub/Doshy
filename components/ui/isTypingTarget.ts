const TYPING_SELECTOR = "input,textarea,select,[contenteditable]";

/** True when a key event came from a text-entry element, which owns the keyboard. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING_SELECTOR) !== null;
}
