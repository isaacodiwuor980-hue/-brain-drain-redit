import { describe, expect, it } from "vitest";
import { buildOfflineBrainMixedFeedV1 } from "./brain-mixed-feed-v1";
import { buildOfflineBrainMixedFeedV2 } from "./brain-mixed-feed-v2";
import type { MixedCandidateV4 } from "./feed-mix-v4";

const items: MixedCandidateV4[] = Array.from({length:20},(_,i)=>({
  id:`id-${i}`,topic:`topic-${i}`,author:`author-${i}`,source:"synthetic",eligible:true,
  signals:{quality:0.5,relevance:0.5}, rising:0.5,discovery:0.5,creatorExposures:i,topicExposures:i,
}));
const options={pageSize:10,seed:42,qualityWeight:0.5,minQuality:0,personalized:false,graphWeight:0,graphQualityWeight:0.5,damping:0.5};

describe("offline brain mixed feed V2",()=>{
  it("reserves discovery on a 10-item page without altering V1",()=>{
    const old=buildOfflineBrainMixedFeedV1(items,[],options);
    const updated=buildOfflineBrainMixedFeedV2(items,[],options);
    expect(old.map(x=>x.section).reduce((a,s)=>(a[s]++,a),{top:0,rising:0,fairness:0,discovery:0})).toEqual({top:7,rising:2,fairness:1,discovery:0});
    expect(updated.map(x=>x.section).reduce((a,s)=>(a[s]++,a),{top:0,rising:0,fairness:0,discovery:0})).toEqual({top:6,rising:2,fairness:1,discovery:1});
    expect(new Set(updated.map(x=>x.candidate.id)).size).toBe(10);
  });
  it("backfills when discovery candidates are missing and never includes ineligible candidates",()=>{
    const candidates=items.map((c,i)=>({...c,discovery:null,eligible:i!==0}));
    const result=buildOfflineBrainMixedFeedV2(candidates,[],options);
    expect(result).toHaveLength(10);
    expect(result.every(x=>x.candidate.eligible && x.section!=="discovery")).toBe(true);
  });
});
