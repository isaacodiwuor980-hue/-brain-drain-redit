/** Synthetic offline benchmark. No network, real users, personal data or live flags. */
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { buildOfflineFeed, diversifyOffline, type FeedCandidate } from "../../lib/tsrg/feed-pipeline";
import { estimateWeightedAgreement } from "../../lib/tsrg/weighted-agreement";

export function runSimulation(users = 20_000) {
  if (!Number.isSafeInteger(users) || users < 2 || users > 100_000) throw new RangeError("Invalid user count");
  // Paired authors/groups have exactly the same synthetic quality and topics.
  const posts = Array.from({ length: 80 }, (_, i) => ({
    id: `post-${String(i).padStart(3, "0")}`, topic: `topic-${Math.floor(i / 8)}`,
    author: `author-${i}`, source: `source-${Math.floor(i / 2) % 4}`,
    group: i % 2, quality: 0.2 + ((Math.floor(i / 2) * 37) % 75) / 100,
  }));
  let quality = 0, baselineQuality = 0, relevance = 0, baselineRelevance = 0;
  let coldTopics = 0, matureTopics = 0, coldCount = 0, matureCount = 0, errors = 0;
  const groups = [0, 0], baselineGroups = [0, 0], latencies: number[] = [];
  for (let user = 0; user < users; user++) {
    const cold = user % 2 === 0;
    const preferred = Math.floor(user / 2) % 10;
    const candidates: FeedCandidate[] = posts.map(post => ({
      id: post.id, topic: post.topic, author: post.author, source: post.source,
      signals: { quality: post.quality, relevance: cold ? 0.5 : (post.topic === `topic-${preferred}` ? 1 : 0.2) },
    }));
    const start = performance.now();
    try {
      const ranked = buildOfflineFeed(candidates, { seed: user, rules: c => 0.45 * c.signals.quality + 0.55 * c.signals.relevance });
      const feed = diversifyOffline(ranked, { windowSize: 10, author: 1, topic: 3, source: 4 }).slice(0, 10);
      latencies.push(performance.now() - start);
      if (feed.length !== 10 || new Set(feed.map(p => p.id)).size !== 10) throw new Error("Invalid output");
      for (const candidate of feed) {
        const post = posts[Number(candidate.id.slice(5))];
        quality += candidate.signals.quality; relevance += candidate.signals.relevance; groups[post.group]++;
      }
      // Recency proxy: original order only; this is not a competitor algorithm.
      for (const candidate of candidates.slice(0, 10)) {
        const post = posts[Number(candidate.id.slice(5))];
        baselineQuality += candidate.signals.quality; baselineRelevance += candidate.signals.relevance; baselineGroups[post.group]++;
      }
      const topics = new Set(feed.map(c => c.topic)).size;
      if (cold) { coldTopics += topics; coldCount++; } else { matureTopics += topics; matureCount++; }
    } catch { errors++; }
  }
  latencies.sort((a, b) => a - b);
  const observations = (users - errors) * 10;
  const agreement = estimateWeightedAgreement([
    { direction: "agree", tier: "life", trust: 1 },
    { direction: "disagree", tier: "mouth", trust: 1 },
  ]);
  return {
    users, candidatesPerUser: posts.length, slots: 10, errors, observations,
    meanSyntheticQuality: quality / observations, chronologicalSyntheticQuality: baselineQuality / observations,
    meanSyntheticRelevance: relevance / observations, chronologicalSyntheticRelevance: baselineRelevance / observations,
    coldUsers: coldCount, coldMeanDistinctTopics: coldTopics / coldCount,
    matureUsers: matureCount, matureMeanDistinctTopics: matureTopics / matureCount,
    exposureBySyntheticGroup: groups, chronologicalExposureBySyntheticGroup: baselineGroups,
    latencyMs: { p50: latencies[Math.floor(latencies.length * 0.5)] ?? null, p95: latencies[Math.floor(latencies.length * 0.95)] ?? null, p99: latencies[Math.floor(latencies.length * 0.99)] ?? null },
    illustrativeAgreementShare: agreement?.weightedShare,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(runSimulation(), null, 2));
}
