#!/usr/bin/env node
/**
 * scripts/apply-migration-0004.ts — Apply migration 0004 to the live
 * Supabase instance via the SQL REST endpoint.
 *
 * Supabase exposes a POST /rest/v1/rpc endpoint for RPC functions, but
 * for raw SQL we use the management API or psql. Since neither may be
 * available, this script applies the migration by:
 *   1. Reading supabase/migrations/0004_community_rebuild.sql
 *   2. Splitting it into individual statements (naive: split on ';')
 *   3. Sending each statement to the Supabase pg-execute endpoint.
 *
 * NOTE: For production, prefer `supabase db push` from the Supabase CLI.
 * This script is a fallback for environments without the CLI.
 *
 * Usage:
 *   node --experimental-strip-types scripts/apply-migration-0004.ts
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/0004_community_rebuild.sql");

async function applyMigration() {
  console.log(`▶ Reading migration: ${MIGRATION_PATH}`);
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  console.log(`  ${sql.split("\n").length} lines, ${sql.length} bytes`);

  // Supabase pg-execute endpoint (requires service-role key).
  // Format: POST https://<project>.supabase.co/pg/query
  const endpoint = `${SUPABASE_URL!.replace(/\/+$/, "")}/pg/query`;

  console.log(`▶ Applying migration via ${endpoint}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`✗ Migration failed: HTTP ${response.status}`);
    console.error(`  ${body.slice(0, 1000)}`);
    console.error("\nFallback options:");
    console.error("  1. Use the Supabase dashboard SQL editor to run the migration manually.");
    console.error("  2. Install the Supabase CLI and run: supabase db push");
    process.exit(1);
  }

  const result = await response.json().catch(() => ({}));
  console.log("✓ Migration applied successfully");
  if (result && typeof result === "object") {
    console.log(`  Result: ${JSON.stringify(result).slice(0, 300)}`);
  }

  // Verify by checking the new tables exist.
  console.log("\n▶ Verifying new tables exist...");
  for (const table of ["otp_requests", "onboarding", "personality_results", "experts", "mentors", "recall_events"]) {
    const r = await fetch(`${SUPABASE_URL!.replace(/\/+$/, "")}/rest/v1/${table}?select=id&limit=1`, {
      headers: {
        apikey: SERVICE_KEY!,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    if (r.status === 200) {
      console.log(`  ✓ ${table} exists`);
    } else if (r.status === 404) {
      console.error(`  ✗ ${table} NOT FOUND (migration did not create it)`);
    } else {
      console.error(`  ? ${table} returned HTTP ${r.status}`);
    }
  }
}

applyMigration().catch((err) => {
  console.error("✗ Migration script failed:", err);
  process.exit(1);
});
