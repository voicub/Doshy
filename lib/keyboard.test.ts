import assert from "node:assert/strict";
import test from "node:test";
import { fieldHints, keyboardOpen, nextBaseline, wantsKeyboard } from "./keyboard.ts";

test("the keyboard is open when a text field has focus and the height shrank by a fifth", () => {
  assert.equal(keyboardOpen(480, 480, true), false);
  assert.equal(keyboardOpen(480, 230, true), true, "800x480 with a keyboard");
  assert.equal(keyboardOpen(844, 480, true), true, "phone portrait");
  assert.equal(keyboardOpen(480, 230, false), false, "a shrunk window without a focused field is not a keyboard");
  assert.equal(keyboardOpen(480, 440, true), false, "a small browser bar change is not a keyboard");
  assert.equal(keyboardOpen(1200, 1080, true), false, "on a big screen it takes 150 px");
  assert.equal(keyboardOpen(1200, 1040, true), true);
});

test("the baseline is the tallest height since the width last changed", () => {
  let b = nextBaseline(null, { width: 390, height: 844 });
  b = nextBaseline(b, { width: 390, height: 500 });
  assert.equal(b.height, 844);
  b = nextBaseline(b, { width: 844, height: 390 });
  assert.deepEqual(b, { width: 844, height: 390 }, "a rotation starts over");
});

test("only text-like fields bring up a keyboard", () => {
  assert.equal(wantsKeyboard({ tagName: "INPUT", type: "text" }), true);
  assert.equal(wantsKeyboard({ tagName: "input", type: "search" }), true);
  assert.equal(wantsKeyboard({ tagName: "INPUT", type: "number" }), true);
  assert.equal(wantsKeyboard({ tagName: "INPUT" }), true);
  assert.equal(wantsKeyboard({ tagName: "TEXTAREA" }), true);
  assert.equal(wantsKeyboard({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(wantsKeyboard({ tagName: "INPUT", type: "range" }), false);
  assert.equal(wantsKeyboard({ tagName: "INPUT", type: "checkbox" }), false);
  assert.equal(wantsKeyboard({ tagName: "BUTTON" }), false);
  assert.equal(wantsKeyboard(null), false);
});

test("fields get keyboard hints unless they already set their own", () => {
  const none = () => false;
  assert.deepEqual(fieldHints({ tagName: "INPUT", type: "search" }, none), { autocomplete: "off", spellcheck: "false", autocapitalize: "off", enterkeyhint: "search" });
  assert.deepEqual(fieldHints({ tagName: "INPUT", type: "text", role: "combobox" }, none).enterkeyhint, "search");
  assert.deepEqual(fieldHints({ tagName: "INPUT", type: "number" }, none).autocapitalize, "off");
  assert.deepEqual(fieldHints({ tagName: "INPUT", type: "text", inForm: true }, none), { autocomplete: "off", spellcheck: "false", enterkeyhint: "go" }, "names keep their capital letter");
  assert.deepEqual(fieldHints({ tagName: "TEXTAREA" }, none), { autocomplete: "off", enterkeyhint: "enter" }, "notes keep spell check");
  assert.deepEqual(fieldHints({ tagName: "INPUT", type: "text" }, (a) => a === "spellcheck" || a === "enterkeyhint"), { autocomplete: "off" });
  assert.deepEqual(fieldHints({ tagName: "INPUT", type: "checkbox" }, none), {}, "no keyboard, no hints");
});
