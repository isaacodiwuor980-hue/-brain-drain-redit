import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
let db: PGlite;

const brain = (id: string, root: string | null = null) => ({ id, title: `Brain ${id}`, category: "", description: "", root_node_id: root, is_public: false, is_favorite: false });
const node = (id: string, brainId: string, yes: string | null = null) => ({ id, brain_id: brainId, node_type: yes ? "question" : "outcome", if_true_node_id: yes, if_false_node_id: yes, attachments: [] });
async function save(uid: string, value: ReturnType<typeof brain>, nodes: ReturnType<typeof node>[]) {
  return db.query<{ result: { created: boolean; nodeCount: number } }>(
    "select public.save_brain_atomic($1::uuid, $2::jsonb, $3::jsonb) as result",
    [uid, JSON.stringify(value), JSON.stringify(nodes)],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.brains (
      id text primary key, author_id uuid, title text not null, category text not null default '',
      description text not null default '', root_node_id text, is_public boolean not null default false,
      is_favorite boolean not null default false, repo_status text, active_branch text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.brain_nodes (
      id text primary key, brain_id text not null references public.brains(id) on delete cascade,
      node_type text not null check (node_type in ('question', 'outcome')), question_text text,
      result_text text, next_steps text, if_true_node_id text references public.brain_nodes(id) on delete set null,
      if_false_node_id text references public.brain_nodes(id) on delete set null,
      attachments jsonb not null default '[]'::jsonb, position jsonb
    );
  `);
  await db.exec(await readFile("supabase/migrations/0005_atomic_brain_save.sql", "utf8"));
}, 30000);

afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("truncate public.brain_nodes, public.brains cascade"); });

describe("atomic brain database save", () => {
  it("creates and updates a connected brain, replacing stale nodes", async () => {
    expect((await save(alice, brain("b1", "q"), [node("q", "b1", "o"), node("o", "b1")])).rows[0].result).toMatchObject({ created: true, nodeCount: 2 });
    expect((await save(alice, brain("b1", "o"), [node("o", "b1")])).rows[0].result).toMatchObject({ created: false, nodeCount: 1 });
    expect((await db.query("select id from public.brain_nodes order by id")).rows).toEqual([{ id: "o" }]);
  });

  it("rejects another author's update without changing ownership or contents", async () => {
    await save(alice, brain("b1", "a"), [node("a", "b1")]);
    await expect(save(bob, { ...brain("b1"), title: "stolen" }, [])).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select author_id, title from public.brains where id='b1'")).rows).toEqual([{ author_id: alice, title: "Brain b1" }]);
    expect((await db.query("select id from public.brain_nodes")).rows).toEqual([{ id: "a" }]);
  });

  it("rolls back the whole write when another brain owns a node ID", async () => {
    await save(alice, brain("a", "shared"), [node("shared", "a")]);
    await expect(save(bob, brain("b", "shared"), [node("shared", "b")])).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select id from public.brains order by id")).rows).toEqual([{ id: "a" }]);
    expect((await db.query("select id, brain_id from public.brain_nodes")).rows).toEqual([{ id: "shared", brain_id: "a" }]);
  });

  it("rejects cross-brain references, mismatched ownership and duplicate node IDs", async () => {
    await expect(save(alice, brain("b", "missing"), [])).rejects.toMatchObject({ code: "22023" });
    await expect(save(alice, brain("b"), [node("n", "other")])).rejects.toMatchObject({ code: "22023" });
    await expect(save(alice, brain("b"), [node("n", "b"), node("n", "b")])).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select id from public.brains")).rows).toEqual([]);
  });

  it("does not grant anon or authenticated roles direct execution", async () => {
    const result = await db.query<{ anon_allowed: boolean; auth_allowed: boolean; service_allowed: boolean }>(`select
      has_function_privilege('anon', 'public.save_brain_atomic(uuid,jsonb,jsonb)', 'execute') as anon_allowed,
      has_function_privilege('authenticated', 'public.save_brain_atomic(uuid,jsonb,jsonb)', 'execute') as auth_allowed,
      has_function_privilege('service_role', 'public.save_brain_atomic(uuid,jsonb,jsonb)', 'execute') as service_allowed`);
    expect(result.rows[0]).toEqual({ anon_allowed: false, auth_allowed: false, service_allowed: true });
  });
});
