import { assertHomesEditable, deleteHome, parseHomePatch, updateHome } from "@/lib/db/connections";
import { api, readJson, reply } from "@/lib/db/http";
import { assertHostAllowed } from "@/lib/server/haUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rename a home, move it to another address, or give it a new token: `{ name?, url?, token? }` -> `{ home }`. A new address needs the token again. */
export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(req, { connect: true }, async (db) => {
    assertHomesEditable();
    const patch = parseHomePatch(await readJson(req, 8192));
    if (!Object.keys(patch).length) return reply({ error: "Nothing to change.", code: "bad_request" }, 400);
    if (patch.url !== undefined) await assertHostAllowed(patch.url);
    return reply({ home: updateHome(db, (await ctx.params).id, patch) });
  });
}

/** Remove a home. 409 `in_use` while plans show it, unless `?movePlans=1`: then they show the main home instead. Deleting a home deletes its stored token. */
export function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return api(req, { write: true }, async (db) => {
    deleteHome(db, (await ctx.params).id, new URL(req.url).searchParams.get("movePlans") === "1");
    return reply({ ok: true });
  });
}
