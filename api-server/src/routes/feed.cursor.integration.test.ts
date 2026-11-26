import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// This verifies SQL keyset semantics in a disposable PostgreSQL-like fixture,
// not the PostgREST parser, network, visibility policy, or a live Supabase DB.
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE posts (id text COLLATE "C" PRIMARY KEY, created_at timestamptz NOT NULL);
    INSERT INTO posts VALUES ('a','2026-11-16T12:00:00.123456Z'),('b','2026-11-16T12:00:00.123456Z'),('c','2026-11-16T12:00:00.123456Z'),('d','2026-11-16T11:59:59.999999Z');`);
},30000);
afterAll(async()=>{await db?.close();});
describe('synthetic keyset paging',()=>{
  it('continues after the last timestamp/id despite insertion and deletion before the cursor',async()=>{
    const first=(await db.query<{id:string;created_at:string}>("SELECT id, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at FROM posts ORDER BY created_at DESC,id ASC LIMIT 2")).rows;
    expect(first.map(row=>row.id)).toEqual(['a','b']);
    const cursor=first[1];expect(cursor.created_at).toBe('2026-11-16T12:00:00.123456Z');
    await db.exec("DELETE FROM posts WHERE id='a'; INSERT INTO posts VALUES ('new','2026-11-16T12:00:01Z')");
    const next=(await db.query<{id:string}>("SELECT id FROM posts WHERE created_at < $1::timestamptz OR (created_at = $1::timestamptz AND id > $2) ORDER BY created_at DESC,id ASC LIMIT 2",[cursor.created_at,cursor.id])).rows;
    expect(next.map(row=>row.id)).toEqual(['c','d']);
  });
});
