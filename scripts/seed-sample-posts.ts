#!/usr/bin/env node
/**
 * scripts/seed-sample-posts.ts — Seed sample posts for end-to-end testing.
 *
 * The /api/feed endpoint returns an empty array when the posts table is
 * empty (audit 2026-11-05 Q2 finding). This script seeds a few sample
 * posts across the seed-* topics so the feed can be verified end-to-end.
 *
 * Usage:
 *   node --experimental-strip-types scripts/seed-sample-posts.ts
 *   # or after build:
 *   node dist/scripts/seed-sample-posts.cjs
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env. Requires at
 * least one auth.users row to attach posts to (passed via --user-id).
 */

import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const args = process.argv.slice(2);
let userId: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--user-id" && args[i + 1]) userId = args[i + 1];
}
if (!userId) {
  console.error("✗ --user-id <uuid> is required (the auth.users id to attach posts to)");
  console.error("  Get a user id from: Supabase dashboard → Authentication → Users");
  process.exit(1);
}

const SAMPLE_POSTS = [
  {
    id: "seed-post-1",
    topic_id: "seed-neuroscience",
    content: "Welcome to Brain Drain! This is a sample post to seed the feed. The default-mode network is the set of brain regions active during rest, mind-wandering, and self-referential thought.",
    post_type: "post",
  },
  {
    id: "seed-post-2",
    topic_id: "seed-philosophy",
    content: "What does it mean to know something? The classical definition: justified true belief. But Gettier cases show this is necessary but not sufficient — what's your favorite modern epistemology?",
    post_type: "question",
  },
  {
    id: "seed-post-3",
    topic_id: "seed-software",
    content: "Law of Leaky Abstractions: every abstraction leaks some underlying detail. The deeper the abstraction stack, the more leaks you'll eventually hit. Plan for it.",
    post_type: "post",
  },
];

async function seed() {
  console.log(`▶ Seeding ${SAMPLE_POSTS.length} sample posts for user ${userId}`);
  const base = `${SUPABASE_URL!.replace(/\/+$/, "")}/rest/v1`;

  for (const post of SAMPLE_POSTS) {
    const response = await fetch(`${base}/posts`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY!,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        id: post.id,
        user_id: userId,
        topic_id: post.topic_id,
        content: post.content,
        post_type: post.post_type,
        created_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`✗ Failed to insert ${post.id}: HTTP ${response.status}`);
      console.error(`  ${body.slice(0, 300)}`);
      process.exit(1);
    }
    console.log(`✓ Inserted ${post.id} (topic=${post.topic_id})`);
  }

  console.log("▶ Done. Verify with: curl http://localhost:3000/api/feed");
}

seed().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
