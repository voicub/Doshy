import test from "node:test";
import assert from "node:assert/strict";
import { httpUrl, parseInline, parseMarkdown } from "./safeMarkdown.ts";

/** Every node in a parsed tree must be plain text or one of the safe shapes: no raw HTML channel exists. */
const SAFE = new Set(["b", "i", "code", "br", "a"]);
function check(nodes: unknown[]): void {
  for (const n of nodes) {
    if (typeof n === "string") continue;
    const o = n as { t: string; c?: unknown[]; items?: unknown[][]; href?: string };
    assert.ok(SAFE.has(o.t) || o.t === "p" || o.t === "ul" || o.t === "ol", `unexpected node ${o.t}`);
    if (o.href) assert.match(o.href, /^https?:\/\//);
    if (o.c) check(o.c);
    if (o.items) o.items.forEach(check);
  }
}

test("renders bold, italic, code and links", () => {
  assert.deepEqual(parseInline("a **b** _c_ `d` [e](https://x.org/p)"), ["a ", { t: "b", c: ["b"] }, " ", { t: "i", c: ["c"] }, " ", { t: "code", c: ["d"] }, " ", { t: "a", href: "https://x.org/p", c: ["e"] }]);
  assert.deepEqual(parseInline("snake_case_name and 2*3"), ["snake_case_name and 2*3"]);
});

test("lists, headings and line breaks", () => {
  assert.deepEqual(parseMarkdown("# Hi\nline1\nline2\n\n- a\n- **b**\n\n1. x\n2) y"), [
    { t: "p", c: [{ t: "b", c: ["Hi"] }] },
    { t: "p", c: ["line1", { t: "br" }, "line2"] },
    { t: "ul", items: [["a"], [{ t: "b", c: ["b"] }]] },
    { t: "ol", items: [["x"], ["y"]] },
  ]);
  assert.deepEqual(parseMarkdown(""), []);
});

test("script tags and attributes stay literal text", () => {
  const blocks = parseMarkdown('<script>alert(1)</script>\n<img src=x onerror="alert(1)">\n<b>**bold**</b>');
  check(blocks);
  const flat = JSON.stringify(blocks);
  assert.ok(flat.includes("<script>alert(1)</script>"));
  assert.ok(flat.includes('onerror=\\"alert(1)\\"')); // present only as text
  assert.equal(blocks.length, 1);
});

test("only http and https links survive", () => {
  for (const bad of ["javascript:void", "JaVaScRiPt:x", "data:text/html,x", "vbscript:x", "//evil.com", "/config/updates", "file:///etc/passwd"]) {
    assert.deepEqual(parseInline(`[click](${bad})`), ["click"], bad);
  }
  assert.deepEqual(parseInline("[click](javascript:alert(1))"), ["click", ")"]); // text only, never a link
  assert.deepEqual(parseInline("[x](http://a.b)"), [{ t: "a", href: "http://a.b/", c: ["x"] }]);
  assert.equal(httpUrl("java\nscript:alert(1)"), null);
  assert.equal(httpUrl(42), null);
  assert.equal(httpUrl("x".repeat(3000)), null);
});

test("nested and hostile input does not escape the safe shapes", () => {
  const blocks = parseMarkdown('**[a](javascript:alert(1))** [<img src=x onerror=alert(1)>](https://ok.org) - <iframe src="javascript:x">\n- <svg onload=alert(1)>');
  check(blocks);
});

test("underscores inside identifiers are not emphasis", () => {
  assert.deepEqual(parseInline("window.__xss=1 and a_b_c, x__y"), ["window.__xss=1 and a_b_c, x__y"]);
  assert.deepEqual(parseInline("__bold__ here"), [{ t: "b", c: ["bold"] }, " here"]);
});
