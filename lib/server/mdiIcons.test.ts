import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMdiIcons, MdiError, USER_AGENT } from "./mdiIcons.ts";

const BULB = '<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7"/>';
const DOOR = '<path fill="currentColor" d="M12 3c-1.11 0-2 .89-2 2H3v14H2v2h20v-2h-1V5c0-1.11-.89-2-2-2z"/>';
const SET = { prefix: "mdi", width: 24, height: 24, icons: { lightbulb: { body: BULB }, "door-open": { body: DOOR }, evil: { body: "<script>alert(1)</script>" } }, aliases: { bulb: { parent: "lightbulb" } } };

type Call = { url: string; ua: string | null; redirect: RequestRedirect | undefined };

/** A made-up Iconify: serves SET for icon requests and a fixed search answer, and writes down every call. */
function fakeIconify(opts: { fail?: boolean; status?: number } = {}) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, ua: new Headers(init?.headers).get("user-agent"), redirect: init?.redirect });
    if (opts.fail) throw new TypeError("fetch failed");
    if (opts.status) return new Response("", { status: opts.status });
    const u = new URL(url);
    if (u.pathname === "/mdi.json") {
      const asked = (u.searchParams.get("icons") ?? "").split(",");
      const icons = Object.fromEntries(Object.entries(SET.icons).filter(([n]) => asked.includes(n)));
      return Response.json({ ...SET, icons, not_found: asked.filter((n) => !(n in SET.icons) && !(n in SET.aliases)) });
    }
    if (u.pathname === "/search") return Response.json({ icons: ["mdi:lamp", "mdi:desk-lamp", "mdi-light:lamp", "mdi:Bad Name"], total: 2, limit: 32, start: 0, collections: {} });
    return new Response("", { status: 404 });
  };
  return { fetch, calls };
}

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "doshy-mdi-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("icons come back cleaned, one request serves several names, and the app names itself", async () => {
  await withDir(async (dir) => {
    const up = fakeIconify();
    const icons = createMdiIcons({ fetch: up.fetch, dir });
    const got = await icons.get(["lightbulb", "door-open", "bulb", "no-such-icon", "evil"]);
    assert.deepEqual(Object.keys(got).sort(), ["bulb", "door-open", "lightbulb"], "an unknown name is absent and a body that is not a clean drawing is never returned");
    assert.ok(!got.lightbulb.body.includes("fill"));
    assert.equal(got.bulb.body, got.lightbulb.body, "an alias draws its parent");
    const iconCalls = up.calls.filter((c) => c.url.includes("/mdi.json"));
    assert.equal(iconCalls.length, 1, "one request for all of them");
    assert.equal(iconCalls[0].ua, USER_AGENT);
    assert.equal(iconCalls[0].redirect, "error");
    assert.ok(iconCalls[0].url.startsWith("https://api.iconify.design/"), "fixed host");
  });
});

test("an icon is fetched once: later asks come from memory, and from the disk after a restart; a missing one is not asked again either", async () => {
  await withDir(async (dir) => {
    const up = fakeIconify();
    const first = createMdiIcons({ fetch: up.fetch, dir });
    await first.get(["lightbulb", "nothing-here"]);
    await first.get(["lightbulb", "nothing-here"]);
    assert.equal(up.calls.length, 1);
    assert.deepEqual(await readdir(join(dir, "mdi")), ["lightbulb.json"]); // written before the answer returned

    const second = createMdiIcons({ fetch: up.fetch, dir });
    const again = await second.get(["lightbulb"]);
    assert.ok(again.lightbulb);
    assert.equal(up.calls.length, 1, "after a restart the disk answers");
  });
});

test("a remembered 'no such icon' is asked again after its time is up", async () => {
  await withDir(async (dir) => {
    const up = fakeIconify();
    let clock = 0;
    const icons = createMdiIcons({ fetch: up.fetch, dir, now: () => clock });
    await icons.get(["nothing-here"]);
    clock += 30 * 60_000;
    await icons.get(["nothing-here"]);
    assert.equal(up.calls.length, 1);
    clock += 40 * 60_000;
    await icons.get(["nothing-here"]);
    assert.equal(up.calls.length, 2);
  });
});

test("names that are not icon names never reach the network", async () => {
  await withDir(async (dir) => {
    const up = fakeIconify();
    const icons = createMdiIcons({ fetch: up.fetch, dir });
    assert.deepEqual(await icons.get(["../etc/passwd", "a,b", "Lamp", ""]), {});
    assert.equal(up.calls.length, 0);
  });
});

test("search: valid mdi names only, cut to what was asked, kept for an hour", async () => {
  await withDir(async (dir) => {
    const up = fakeIconify();
    const icons = createMdiIcons({ fetch: up.fetch, dir });
    assert.deepEqual(await icons.search("Lamp!", 10), ["lamp", "desk-lamp"]);
    assert.deepEqual(await icons.search("lamp", 1), ["lamp"]);
    assert.equal(up.calls.length, 1);
    assert.match(up.calls[0].url, /query=lamp&prefix=mdi/);
    assert.deepEqual(await icons.search("!", 10), [], "nothing searchable: no request");
    assert.equal(up.calls.length, 1);
  });
});

test("when the service cannot be reached or says no, the reply is a plain sentence and nothing is kept", async () => {
  await withDir(async (dir) => {
    const down = createMdiIcons({ fetch: fakeIconify({ fail: true }).fetch, dir });
    await assert.rejects(down.get(["lightbulb"]), (e) => e instanceof MdiError && e.status === 503 && !/fetch failed|iconify/i.test(e.message));
    const slow = createMdiIcons({ fetch: fakeIconify({ status: 429 }).fetch, dir });
    await assert.rejects(slow.search("lamp", 5), (e) => e instanceof MdiError && e.status === 429);
    const broken = createMdiIcons({ fetch: fakeIconify({ status: 500 }).fetch, dir });
    await assert.rejects(broken.get(["lightbulb"]), (e) => e instanceof MdiError && e.status === 503);
    await assert.rejects(readdir(join(dir, "mdi")), "nothing was written");
  });
});

test("the server-wide rate gate stops a request before it leaves", async () => {
  await withDir(async (dir) => {
    const up = fakeIconify();
    const icons = createMdiIcons({ fetch: up.fetch, dir, allow: () => false });
    await assert.rejects(icons.get(["lightbulb"]), (e) => e instanceof MdiError && e.status === 429);
    assert.equal(up.calls.length, 0);
  });
});

test("an answer that is not JSON, or is too large, is refused", async () => {
  await withDir(async (dir) => {
    const text = createMdiIcons({ fetch: async () => new Response("<html>", { status: 200 }), dir });
    await assert.rejects(text.get(["lightbulb"]), (e) => e instanceof MdiError && e.status === 502);
    const huge = createMdiIcons({ fetch: async () => new Response("x".repeat(600 * 1024)), dir });
    await assert.rejects(huge.get(["lightbulb"]), (e) => e instanceof MdiError && e.status === 502);
  });
});
