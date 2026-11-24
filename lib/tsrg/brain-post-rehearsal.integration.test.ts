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
});
