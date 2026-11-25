import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const names = 'analytics_events app_admins brain_nodes brain_scores brains check_ins comments communities community_members conversation_participants conversations experts follows habits mentors messages milestones mission_scores missions notifications onboarding pathways post_scores posts profiles reactions recall_events reports reputation skills topic_followers topics user_follows user_topic_affinity xp_events'.split(' ');
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; ${names.map(n => `CREATE TABLE public.${n}(id integer); INSERT INTO public.${n} VALUES (1); GRANT SELECT, TRUNCATE ON public.${n} TO anon, authenticated, service_role;`).join(' ')}`);
  return db;
}
const migration = () => readFile('supabase/live-reviewed/20261125231050_revoke_public_browser_truncate.sql', 'utf8');
describe('browser truncate privilege hardening in synthetic fixture', () => {
  it('preserves rows and read/service permissions, and denies browser truncation', async () => {
    const db = await fixture();
    try {
      await db.exec(await migration());
      for (const n of names) {
        const { rows } = await db.query<{anon: boolean; auth: boolean; service: boolean; reading: boolean}>(`SELECT has_table_privilege('anon', $1, 'TRUNCATE') AS anon, has_table_privilege('authenticated', $1, 'TRUNCATE') AS auth, has_table_privilege('service_role', $1, 'TRUNCATE') AS service, has_table_privilege('anon', $1, 'SELECT') AS reading`, [`public.${n}`]);
        expect(rows[0]).toEqual({anon:false,auth:false,service:true,reading:true});
        expect((await db.query(`SELECT * FROM public.${n}`)).rows).toEqual([{id:1}]);
      }
    } finally { await db.close(); }
  });
  it('aborts the entire statement if a privilege is inherited', async () => {
    const db = await fixture();
    try {
      await db.exec('CREATE ROLE extra; GRANT extra TO authenticated; GRANT TRUNCATE ON public.xp_events TO extra;');
      await expect(db.exec(await migration())).rejects.toThrow(/inherited grants/);
      const r = await db.query<{ permitted: boolean }>("SELECT has_table_privilege('anon','public.analytics_events','TRUNCATE') AS permitted");
      expect(r.rows[0].permitted).toBe(true);
    } finally { await db.close(); }
  });
});
