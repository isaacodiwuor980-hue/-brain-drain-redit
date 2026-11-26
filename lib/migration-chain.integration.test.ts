import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFile, readdir } from "node:fs/promises";

// Local substitute for Supabase's auth schema; pgvector is absent here, so this
// exercises only the explicitly supported non-semantic path, not real Supabase.
async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;`);
  return db;
}
async function migrations() {
  const names = (await readdir("supabase/migrations")).filter(n => /^\d+.*\.sql$/.test(n)).sort();
  return Promise.all(names.map(async name => ({ name, sql: await readFile(`supabase/migrations/${name}`, "utf8") })));
}
describe("complete local migration chain (no vector)", () => {
  it("applies each migration in order on a fresh database", async () => {
    const db = await freshDb();
    try {
      for (const { name, sql } of await migrations()) {
        try { await db.exec(sql); } catch (e) { throw new Error(`Migration ${name} failed`, { cause: e }); }
      }
      expect((await db.query("SELECT to_regclass('public.tiered_post_votes') AS votes")).rows).toEqual([{ votes: "tiered_post_votes" }]);
    } finally { await db.close(); }
  }, 60000);
  it("re-applies the additive foundation migrations on the complete schema", async () => {
    const db = await freshDb();
    try {
      const files = await migrations();
      for (const { name, sql } of files) {
        try { await db.exec(sql); } catch (e) { throw new Error(`Migration ${name} failed`, { cause: e }); }
      }
      // 0001 uses unconditional CREATE POLICY and does not claim replay safety.
      for (const { name, sql } of files.filter(f => /^000[5-9]|^001[01]/.test(f.name))) {
        try { await db.exec(sql); } catch (e) { throw new Error(`Re-apply ${name} failed`, { cause: e }); }
      }
      expect((await db.query("SELECT to_regclass('public.tiered_post_votes') AS votes")).rows).toEqual([{ votes: "tiered_post_votes" }]);
    } finally { await db.close(); }
  }, 60000);
});
