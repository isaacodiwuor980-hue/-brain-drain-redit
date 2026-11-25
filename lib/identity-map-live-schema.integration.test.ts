import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');`);
  return db;
}
const migration = () => readFile('supabase/live-reviewed/20261125232116_identity_map_storage.sql', 'utf8');
describe('identity-map storage on synthetic principals', () => {
  it('starts empty, enforces unique existing users, and cascades deletion', async () => {
    const db = await setup();
    try {
      await db.exec(await migration());
      expect((await db.query('SELECT * FROM user_identity_map')).rows).toHaveLength(0);
      await db.query('INSERT INTO user_identity_map(firebase_subject,supabase_uid) VALUES ($1,$2)', ['alice',alice]);
      await expect(db.query('INSERT INTO user_identity_map(firebase_subject,supabase_uid) VALUES ($1,$2)', ['alice',bob])).rejects.toThrow();
      await expect(db.query('INSERT INTO user_identity_map(firebase_subject,supabase_uid) VALUES ($1,$2)', ['other',alice])).rejects.toThrow();
      await expect(db.query('INSERT INTO user_identity_map(firebase_subject,supabase_uid) VALUES ($1,$2)', ['bad,filter',bob])).rejects.toThrow();
      await expect(db.query('INSERT INTO user_identity_map(firebase_subject,supabase_uid) VALUES ($1,$2)', ['missing','00000000-0000-4000-8000-000000000003'])).rejects.toThrow();
      await db.query('DELETE FROM auth.users WHERE id=$1', [alice]);
      expect((await db.query('SELECT * FROM user_identity_map')).rows).toHaveLength(0);
    } finally { await db.close(); }
  });
  it('denies browser roles and service-role writes while allowing service lookup', async () => {
    const db = await setup();
    try {
      await db.exec(await migration());
      await db.query('INSERT INTO user_identity_map(firebase_subject,supabase_uid) VALUES ($1,$2)', ['alice',alice]);
      for (const role of ['anon','authenticated','service_role']) {
        await db.exec(`SET ROLE ${role}`);
        try {
          if (role === 'service_role') expect((await db.query('SELECT * FROM user_identity_map')).rows).toHaveLength(1);
          else await expect(db.query('SELECT * FROM user_identity_map')).rejects.toThrow();
          await expect(db.query('INSERT INTO user_identity_map(firebase_subject,supabase_uid) VALUES ($1,$2)', ['bob',bob])).rejects.toThrow();
          await expect(db.query('DELETE FROM user_identity_map')).rejects.toThrow();
        } finally { await db.exec('RESET ROLE'); }
      }
    } finally { await db.close(); }
  });
  it('stops rather than replacing an existing table', async () => {
    const db = await setup();
    try {
      await db.exec('CREATE TABLE public.user_identity_map(existing text);');
      await expect(db.exec(await migration())).rejects.toThrow(/Unexpected identity schema/);
    } finally { await db.close(); }
  });
});
