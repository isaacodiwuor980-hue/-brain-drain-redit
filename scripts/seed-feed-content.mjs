#!/usr/bin/env node
/**
 * seed-feed-content.mjs — Seed a realistic, varied set of demo posts + a few
 * reactions so the home feed looks alive (not just 2 "Anonymous" demo posts).
 *
 * WHY: the posts table only ever held 2 demo rows (verified 2026-11-14 by a
 * direct Supabase REST count probe), and 001_seed_data.sql has zero INSERTs.
 * That made the preview feed look "dead / wiped out". This is NOT recovering
 * lost real user data (there was none) — it is seeding richer DEMO content so
 * the preview is presentable for production launch.
 *
 * Idempotent: uses Prefer: resolution=merge-duplicates, so re-running updates
 * rows in place instead of duplicating. Resilient: a per-row failure logs and
 * continues rather than aborting the whole seed.
 *
 * Usage: node scripts/seed-feed-content.mjs
 */
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_USER_ID = "44444444-4444-4444-4444-444444444444"; // existing "Seed User" profile

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const BASE = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1`;
const HDRS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  // merge on id conflict → idempotent re-runs
  Prefer: "resolution=merge-duplicates,return=representation",
};

// 14 posts across all 6 topics, mixed post_types, staggered over ~3 days so
// the feed (ordered created_at desc) shows a natural chronological mix.
const HOURS_AGO = (h) => new Date(Date.now() - h * 3600_000).toISOString();

const POSTS = [
  { id: "rich-1",  topic_id: "ai-safety",    post_type: "question", content: "If a frontier model refuses a benign request because of an overzealous safety filter, is that a failure of alignment or a failure of UX? Where do you draw the line?", hours: 2 },
  { id: "rich-2",  topic_id: "career",       post_type: "post",     content: "After 3 months of job hunting, the single highest-leverage change I made: stop applying to listings, start replying to hiring managers with a 90-day plan attached. Response rate went from 4% to 31%.", hours: 5 },
  { id: "rich-3",  topic_id: "creativity",   post_type: "post",     content: "Constraint breeds creativity. I gave myself 30 minutes and only black ink to redesign our landing page hero. The result outperformed the 2-week full-color version in A/B test. Less options, more decisions made.", hours: 9 },
  { id: "rich-4",  topic_id: "health",       post_type: "question", content: "Has anyone tracked HRV (heart rate variability) for >6 months? Did you find a single intervention that moved it meaningfully, or is it too noisy to be actionable day-to-day?", hours: 14 },
  { id: "rich-5",  topic_id: "finance",      post_type: "post",     content: "The 4% rule assumes a 30-year retirement. For a 50+ year horizon, Trinity-study withdrawals need to drop closer to 3.25%. The difference between 'safe' and 'durable' over decades is larger than most calculators admit.", hours: 20 },
  { id: "rich-6",  topic_id: "relationships",post_type: "question", content: "When a long friendship becomes asymmetric — one person always initiates, the other always 'too busy' — at what point do you stop reaching out, and how do you do it without resentment?", hours: 26 },
  { id: "rich-7",  topic_id: "ai-safety",    post_type: "post",     content: "RLHF doesn't teach a model to be safe — it teaches it to produce text that gets labeled as safe by annotators. Those are different objectives, and the gap is where jailbreaks live.", hours: 30 },
  { id: "rich-8",  topic_id: "career",       post_type: "answer",   content: "Re: the salary-negotiation question — the best single prompt before accepting any offer: 'What does success look like for this role at 90 days, 6 months, and 12 months?' It reframes the conversation from price to expectations.", hours: 33 },
  { id: "rich-9",  topic_id: "creativity",   post_type: "note",     content: "Sketchbook rule: never erase during a 5-minute warmup. The 'mistakes' are where the interesting shapes hide. Polishing too early kills the discovery.", hours: 40 },
  { id: "rich-10", topic_id: "health",       post_type: "post",     content: "Sleep is the highest-ROI health intervention and the most underrated one. One week of 7+ hours did more for my focus than 3 months of optimized supplements. The boring answer keeps winning.", hours: 48 },
  { id: "rich-11", topic_id: "finance",      post_type: "question", content: "Index funds beat ~90% of active managers over 15 years. Why do we still believe our stock-picking will be in the 10%? Is it overconfidence, or genuine edge for some people?", hours: 55 },
  { id: "rich-12", topic_id: "relationships",post_type: "post",     content: "The strongest couples I know don't argue less — they repair faster. The 4-minute window after a fight, where someone breaks the silence with curiosity instead of defense, predicts relationship survival better than the fight itself.", hours: 62 },
  { id: "rich-13", topic_id: "ai-safety",    post_type: "post",     content: "Capability and alignment don't scale at the same rate. Capability comes from compute and data; alignment comes from techniques that are currently artisanal. The gap is the risk.", hours: 70 },
  { id: "rich-14", topic_id: "career",       post_type: "question", content: "Is it worth taking a 20% pay cut to move from a 'prestige' company where you're a cog to a smaller company where you own outcomes? Curious about the 5-year hindsight view, not the 5-month one.", hours: 78 },
];

// A few upvotes on selected posts (safe — single demo voter, real target_ids).
const REACTIONS = [
  { target_id: "rich-2",  reaction_type: "upvote" },
  { target_id: "rich-3",  reaction_type: "upvote" },
  { target_id: "rich-7",  reaction_type: "upvote" },
  { target_id: "rich-10", reaction_type: "upvote" },
  { target_id: "rich-12", reaction_type: "upvote" },
  { target_id: "rich-8",  reaction_type: "upvote" },
];

async function insertRow(table, row) {
  const res = await fetch(`${BASE}/${table}`, {
    method: "POST",
    headers: HDRS,
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function main() {
  console.log(`▶ Seeding ${POSTS.length} posts across 6 topics (user: ${DEMO_USER_ID})`);
  let okPosts = 0, failPosts = 0;
  for (const p of POSTS) {
    try {
      await insertRow("posts", {
        id: p.id,
        user_id: DEMO_USER_ID,
        topic_id: p.topic_id,
        content: p.content,
        post_type: p.post_type,
        created_at: HOURS_AGO(p.hours),
      });
      console.log(`  ✓ post ${p.id} (${p.post_type}, ${p.topic_id})`);
      okPosts++;
    } catch (err) {
      console.error(`  ✗ post ${p.id} failed: ${err.message}`);
      failPosts++;
    }
  }

  console.log(`▶ Seeding ${REACTIONS.length} upvote reactions`);
  let okRx = 0, failRx = 0;
  for (const r of REACTIONS) {
    try {
      await insertRow("reactions", {
        target_type: "post",
        target_id: r.target_id,
        reaction_type: r.reaction_type,
        user_id: DEMO_USER_ID,
      });
      console.log(`  ✓ reaction ${r.reaction_type} → ${r.target_id}`);
      okRx++;
    } catch (err) {
      // Likely a unique-constraint hit (already reacted) — non-fatal.
      console.warn(`  ~ reaction ${r.target_id} skipped: ${err.message.split(":")[0]}`);
      failRx++;
    }
  }

  console.log(`\n✓ Done. Posts: ${okPosts} ok, ${failPosts} failed. Reactions: ${okRx} ok, ${failRx} skipped.`);
  console.log("  Verify: curl 'http://localhost:3000/api/feed?mode=foryou&limit=20'");
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
