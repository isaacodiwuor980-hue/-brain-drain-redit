import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

describe("proposed transactional rehearsal script",()=>{
  it("runs with synthetic data and leaves no test schema in an isolated PGlite database",async()=>{
    const db=new PGlite();
    try {
      const results=await db.exec(await readFile("supabase/rehearsals/brain_link_transaction.sql","utf8"));
      expect(results.at(-1)?.rows).toEqual([{result:"synthetic rehearsal completed; verify schema absence separately"}]);
      expect((await db.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='arena_brain_visibility_rehearsal') AS present")).rows).toEqual([{present:false}]);
    } finally {await db.close();}
  },30000);
  it("preserves a pre-existing same-named schema if creation conflicts",async()=>{
    const db=new PGlite();
    try {
      await db.exec("CREATE SCHEMA arena_brain_visibility_rehearsal; CREATE TABLE arena_brain_visibility_rehearsal.existing_fixture(id int); INSERT INTO arena_brain_visibility_rehearsal.existing_fixture VALUES (7)");
      await expect(db.exec(await readFile("supabase/rehearsals/brain_link_transaction.sql","utf8"))).rejects.toThrow();
      await db.exec("ROLLBACK");
      expect((await db.query("SELECT id FROM arena_brain_visibility_rehearsal.existing_fixture")).rows).toEqual([{id:7}]);
    } finally {await db.close();}
  },30000);
  it("removes its synthetic schema when an assertion fails and the client rolls back",async()=>{
    const db=new PGlite();
    try {
      const sql=await readFile("supabase/rehearsals/brain_link_transaction.sql","utf8");
      const failing=sql.replace("  UPDATE arena_brain_visibility_rehearsal.brains SET is_public=false", "  RAISE EXCEPTION 'synthetic-test-failure';\n  UPDATE arena_brain_visibility_rehearsal.brains SET is_public=false");
      expect(failing).not.toBe(sql);
      await expect(db.exec(failing)).rejects.toThrow("synthetic-test-failure");
      await db.exec("ROLLBACK");
      expect((await db.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='arena_brain_visibility_rehearsal') AS present")).rows).toEqual([{present:false}]);
    } finally {await db.close();}
  },30000);
});
