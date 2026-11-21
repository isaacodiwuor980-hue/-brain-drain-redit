import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { detectRings, quantizeCommentScore, toFixedV2 } from "./index";

// This tests the existing isolated ranking prototype, not nonexistent buildFeed.
const script = `
import { scoreFeedCandidate } from './lib/tsrg/feed-ranking.ts';
const output=[];
for (let seed=0;seed<10;seed++) {
  let s=seed+1; const random=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/2**32);
  const candidates=[];
  for(let i=0;i<1000;i++) {
    const impressions=1+Math.floor(random()*1000);
    const x={consensus:random(),confidence:random(),topicEngagement:random(),viewThroughRatio:random(),recency:random(),topicInterest:random(),authorAuthority:random(),impressions,brigadeRisk:random(),lowTrustSpike:random()};
    candidates.push({id:i,score:scoreFeedCandidate(x)});
  }
  candidates.sort((a,b)=>b.score-a.score||a.id-b.id); output.push(candidates.slice(0,20));
}
process.stdout.write(JSON.stringify(output));`;
function run() { return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" }); }
describe("same-machine local repeatability", () => {
  it("repeats 1000 synthetic candidates over ten seeds across separate processes", () => {
    const first = run(), second = run(); expect(second).toBe(first);
    const hash = createHash("sha256").update(first).digest("hex");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  }, 30000);
  it("repeats deterministic scalar and ring outputs for same ordered input", () => {
    const edges = [{u1:"a",u2:"b",weight:1},{u1:"a",u2:"c",weight:1},{u1:"b",u2:"c",weight:1}];
    const render = () => JSON.stringify({fixed: toFixedV2(1.25).toString(), bucket: quantizeCommentScore(0.6), rings: detectRings(edges, 3).map(r => ({ members: [...r.members], coefficient: r.clusteringCoeff }))});
    const initial = render(); for (let i = 0; i < 10; i++) expect(render()).toBe(initial);
  });
});
