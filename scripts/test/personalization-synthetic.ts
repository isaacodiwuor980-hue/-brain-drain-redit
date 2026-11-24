/* Offline synthetic comparison, no real users or data. */
import { pathToFileURL } from "node:url";
import { rankOfflinePersonalizedV3 } from "../../lib/tsrg/personalized-feed-v3";
import type { FeedCandidate } from "../../lib/tsrg/feed-pipeline";

export function runPersonalizationSimulation(users = 20_001) {
  if (!Number.isSafeInteger(users) || users < 3 || users > 100_002) throw new RangeError("Invalid user count");
  const candidates: FeedCandidate[] = Array.from({ length: 40 }, (_, i) => ({
    id: `item-${String(i).padStart(2, "0")}`, topic: `topic-${Math.floor(i / 4)}`,
    author: `author-${i}`, source: `source-${i % 3}`,
    signals: { quality: 0.3 + (Math.floor(i / 2) % 5) * 0.1, relevance: 0.5 },
  }));
  const groups = {
    warm: { users: 0, preferenceSlots: 0, distinctTopics: 0 },
    cold: { users: 0, preferenceSlots: 0, distinctTopics: 0 },
    optedOut: { users: 0, preferenceSlots: 0, distinctTopics: 0 },
  };
  let invalid = 0;
  for (let i = 0; i < users; i++) {
    const group = i % 3 === 0 ? "warm" : i % 3 === 1 ? "cold" : "optedOut";
    const topic = `topic-${Math.floor(i / 3) % 10}`;
    try {
      const interests = group === "warm" ? new Map([[topic, 0.9]]) : new Map<string, number>();
      const feed = rankOfflinePersonalizedV3(candidates, { seed: i, personalized: group !== "optedOut", interests, qualityWeight: 0.4 }).slice(0, 10);
      if (feed.length !== 10 || new Set(feed.map(p => p.id)).size !== 10) throw new Error("Invalid feed");
      const bucket = groups[group]; bucket.users++;
      bucket.preferenceSlots += feed.filter(p => p.topic === topic).length;
      bucket.distinctTopics += new Set(feed.map(p => p.topic)).size;
    } catch { invalid++; }
  }
  return { requested: users, candidatesPerUser: 40, feedSize: 10, invalid, groups };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(runPersonalizationSimulation(), null, 2));
