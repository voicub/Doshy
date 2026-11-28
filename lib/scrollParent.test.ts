import assert from "node:assert/strict";
import test from "node:test";
import { scrollParent } from "./scrollParent.ts";

type N = { name: string; overflowY: string; parentElement: N | null };
const chain = (...ov: string[]): N[] => {
  const nodes = ov.map((overflowY, i) => ({ name: `n${i}`, overflowY, parentElement: null as N | null }));
  nodes.forEach((n, i) => (n.parentElement = nodes[i + 1] ?? null));
  return nodes; // nodes[0] is the sentinel, the last one the outermost ancestor
};
const find = (nodes: N[]) => scrollParent(nodes[0], (e) => e.overflowY)?.name ?? null;

test("the grid is the root when it scrolls itself (desktop catalog)", () => {
  assert.equal(find(chain("visible", "auto", "auto")), "n1");
});

test("a grid that does not scroll hands the job to the sheet around it (compact catalog)", () => {
  assert.equal(find(chain("visible", "visible", "auto", "hidden")), "n2");
});

test("the sentinel's own overflow does not count", () => {
  assert.equal(find(chain("auto", "visible", "hidden")), null);
});

test("hidden and clip never scroll under a finger; with no scroller the page is the root", () => {
  assert.equal(find(chain("visible", "hidden", "clip", "visible")), null);
  assert.equal(scrollParent<N>(null), null);
});

test("overflow: scroll counts", () => {
  assert.equal(find(chain("visible", "scroll")), "n1");
});
