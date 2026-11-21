import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
describe("additive post tag migration in an isolated database", () => {
  it("preserves legacy posts and supports tag storage on repeated application", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE TABLE public.posts (id text PRIMARY KEY, content text NOT NULL); INSERT INTO public.posts VALUES ('legacy', 'unchanged');");
      const migration = await readFile("supabase/migrations/0010_post_tags.sql", "utf8");
      await db.exec(migration); await db.exec(migration);
      expect((await db.query("SELECT id, content, tags FROM public.posts")).rows).toEqual([{ id: "legacy", content: "unchanged", tags: [] }]);
      await db.query("UPDATE public.posts SET tags = $1 WHERE id = $2", [["coding", "typescript"], "legacy"]);
      expect((await db.query("SELECT tags FROM public.posts")).rows).toEqual([{ tags: ["coding", "typescript"] }]);
    } finally { await db.close(); }
  }, 30000);
});
