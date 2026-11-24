import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { buildOfflineMixedFeedV4 } from "./feed-mix-v4";

// Digest captured from V4 before extracting its allocation implementation.
it("preserves V4 ordering and section assignment for 40 synthetic page sizes", () => {
  const items=Array.from({length:40},(_,i)=>({id:`p-${i}`,author:`a-${i%7}`,topic:`t-${i%4}`,source:"s",signals:{quality:(i%10)/10,relevance:(i%7)/7},eligible:i%9!==0,rising:i%3?i%7/7:null,discovery:i%4?i%5/5:null,creatorExposures:i%8,topicExposures:i%6}));
  const rows=Array.from({length:40},(_,i)=>buildOfflineMixedFeedV4(items,{pageSize:i,seed:i,qualityWeight:0.4,minQuality:0.2,personalized:false}).map(r=>[r.candidate.id,r.section]));
  expect(createHash("sha256").update(JSON.stringify(rows)).digest("hex")).toBe("df24932f266f66583b05f142e1113d5c93d51c28f98d116cdabce9ccc9834b9a");
});
