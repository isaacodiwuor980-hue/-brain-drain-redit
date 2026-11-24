import { describe, expect, it } from "vitest";
import { allocateOfflineMixV4, buildOfflineMixedFeedV4, type MixedCandidateV4 } from "./feed-mix-v4";
import { allocateOfflineMixV5, buildOfflineMixedFeedV5 } from "./feed-mix-v5";
const candidate=(i:number, overrides:Partial<MixedCandidateV4>={}):MixedCandidateV4=>({
  id:`p-${i}`, author:`a-${i}`, topic:`t-${i%4}`, source:"fixture", signals:{quality:0.8,relevance:0.5}, eligible:true,
  rising:0.4, discovery:0.5, creatorExposures:2, topicExposures:3, ...overrides,
});
const options={pageSize:10,seed:42,qualityWeight:0.5,minQuality:0.2,personalized:false} as const;
describe("offline short-page discovery comparison",()=>{
  it("reserves discovery for pages of at least five when rounding would omit it",()=>{
    expect(allocateOfflineMixV4(10)).toEqual({top:7,rising:2,fairness:1,discovery:0});
    expect(allocateOfflineMixV5(10)).toEqual({top:6,rising:2,fairness:1,discovery:1});
    expect(allocateOfflineMixV5(20)).toEqual({top:14,rising:3,fairness:2,discovery:1});
    for(let n=0;n<=1000;n++) {
      const allocation=allocateOfflineMixV5(n);
      expect(Object.values(allocation).reduce((a,b)=>a+b,0)).toBe(n);
      expect(Object.values(allocation).every(v=>v>=0)).toBe(true);
      if(n>=5) expect(allocation.discovery).toBeGreaterThanOrEqual(1);
      else expect(allocation).toEqual(allocateOfflineMixV4(n));
    }
  });
  it("selects an eligible discovery candidate and preserves V4 behavior",()=>{
    const items=Array.from({length:20},(_,i)=>candidate(i));
    const v5=buildOfflineMixedFeedV5(items,options);
    expect(v5.filter(row=>row.section==="discovery")).toHaveLength(1);
    expect(buildOfflineMixedFeedV4(items,options).filter(row=>row.section==="discovery")).toHaveLength(0);
    expect(new Set(v5.map(row=>row.candidate.id)).size).toBe(10);
    expect(buildOfflineMixedFeedV5([...items].reverse(),options)).toEqual(v5);
  });
  it("does not fill discovery with denied or below-floor items",()=>{
    const items=Array.from({length:15},(_,i)=>candidate(i,{discovery:i===0?0.9:null,eligible:i!==0}));
    const out=buildOfflineMixedFeedV5(items,options);
    expect(out).toHaveLength(10);
    expect(out.some(row=>row.section==="discovery" || row.candidate.id==="p-0")).toBe(false);
  });
});
