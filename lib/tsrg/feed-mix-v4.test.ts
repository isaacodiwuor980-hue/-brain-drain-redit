import { describe, expect, it } from "vitest";
import { buildOfflineMixedFeedV4, allocateOfflineMixV4, type MixedCandidateV4 } from "./feed-mix-v4";

const candidate = (i: number, overrides: Partial<MixedCandidateV4> = {}): MixedCandidateV4 => ({
  id:`item-${i}`, topic:`topic-${i % 4}`, author:`author-${i}`, source:"synthetic",
  signals:{quality:0.8,relevance:0.5}, eligible:true, rising:0.4, discovery:0.3,
  creatorExposures:10, topicExposures:10, ...overrides,
});
const options = { pageSize:20, seed:42, qualityWeight:0.5, minQuality:0.2, personalized:false } as const;

describe("offline mixed-feed scaffold", () => {
  it("uses deterministic largest-remainder quotas, including short pages", () => {
    expect(allocateOfflineMixV4(20)).toEqual({top:14,rising:3,fairness:2,discovery:1});
    expect(allocateOfflineMixV4(10)).toEqual({top:7,rising:2,fairness:1,discovery:0});
    for (let n=0;n<=100;n++) expect(Object.values(allocateOfflineMixV4(n)).reduce((a,b)=>a+b,0)).toBe(n);
  });
  it("fills a sufficiently diverse fixture without duplicates, and is independent of input order", () => {
    const input=Array.from({length:40},(_,i)=>candidate(i));
    const out=buildOfflineMixedFeedV4(input,options);
    expect(out.length).toBe(20);
    expect(new Set(out.map(x=>x.candidate.id)).size).toBe(20);
    expect(out.reduce((a,x)=>({...a,[x.section]:(a[x.section]??0)+1}),{} as Record<string,number>)).toEqual({top:14,rising:3,fairness:2,discovery:1});
    expect(buildOfflineMixedFeedV4([...input].reverse(),options)).toEqual(out);
  });
  it("never fills from denied or low-quality candidates and backfills missing sections", () => {
    const input=[candidate(1,{eligible:false}),candidate(2,{signals:{quality:0.1,relevance:1}}),candidate(3,{rising:null,discovery:null,creatorExposures:null,topicExposures:null})];
    const out=buildOfflineMixedFeedV4(input,{...options,pageSize:10});
    expect(out.map(x=>x.candidate.id)).toEqual(["item-3"]);
    expect(out[0].section).toBe("top");
  });
  it("favours lower creator and topic exposure in the fairness section", () => {
    const input=Array.from({length:10},(_,i)=>candidate(i,{rising:null,discovery:null,creatorExposures:i===0?0:100,topicExposures:i===0?0:100}));
    const out=buildOfflineMixedFeedV4(input,{...options,pageSize:10});
    expect(out.find(x=>x.section==="fairness")?.candidate.id).toBe("item-0");
  });
  it("uses topic interest for top scoring only when enabled and never reads it when off", () => {
    const input=[candidate(1,{topic:"art",rising:null,discovery:null,creatorExposures:null,topicExposures:null}),candidate(2,{topic:"code",rising:null,discovery:null,creatorExposures:null,topicExposures:null})];
    const on=buildOfflineMixedFeedV4(input,{...options,pageSize:2,personalized:true,interests:new Map([["code",0.9],["art",0.1]])});
    expect(on[0].candidate.topic).toBe("code");
    const unreadable=new Proxy(new Map<string,number>(),{get(){throw new Error("accessed");}});
    expect(()=>buildOfflineMixedFeedV4(input,{...options,pageSize:2,interests:unreadable})).not.toThrow();
  });
  it("rejects ambiguous or invalid candidates and options", () => {
    expect(()=>buildOfflineMixedFeedV4([candidate(1),candidate(1)],options)).toThrow(RangeError);
    expect(()=>buildOfflineMixedFeedV4([candidate(1,{rising:NaN})],options)).toThrow(RangeError);
    expect(()=>buildOfflineMixedFeedV4([candidate(1,{creatorExposures:-1})],options)).toThrow(RangeError);
    expect(()=>buildOfflineMixedFeedV4([candidate(1,{eligible:undefined as unknown as boolean})],options)).toThrow(RangeError);
    expect(()=>buildOfflineMixedFeedV4([], {...options,pageSize:-1})).toThrow(RangeError);
  });
});
