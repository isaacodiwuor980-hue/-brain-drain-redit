import { describe, expect, it } from "vitest";
import { buildOfflineBrainMixedFeedV1 } from "./brain-mixed-feed-v1";
import type { MixedCandidateV4 } from "./feed-mix-v4";
import type { OfflineBrainV1 } from "./brain-branch-rank-v1";

const candidate = (id:string, brainId?:string): MixedCandidateV4 & {brainId?:string} => ({
  id, brainId, topic:"science", author:`author-${id}`, source:"synthetic", eligible:true,
  signals:{quality:0.2,relevance:0.5}, rising:null, discovery:null, creatorExposures:null, topicExposures:null,
});
const brain = (id:string,quality:number):OfflineBrainV1=>({brainId:id,rootId:"root",nodes:[{id:"root",quality,relevance:quality,edges:[]}]});
const options = {pageSize:2,seed:1,qualityWeight:1,minQuality:0,personalized:false,graphWeight:1,graphQualityWeight:0.5,damping:0.5};

describe("synthetic brain and feed ranking composition",()=>{
  it("uses bounded graph score to rank linked candidates without mutating inputs",()=>{
    const candidates=[candidate("weak","weak-brain"),candidate("strong","strong-brain")];
    const brains=[brain("weak-brain",0.1),brain("strong-brain",1)];
    const snapshot=structuredClone({candidates,brains});
    const ranked=buildOfflineBrainMixedFeedV1(candidates,brains,options);
    expect(ranked.map(x=>x.candidate.id)).toEqual(["strong","weak"]);
    expect(ranked[0].candidate.signals.quality).toBe(0.2);
    expect({candidates,brains}).toEqual(snapshot);
  });
  it("does not include ineligible candidates and preserves unlinked quality",()=>{
    const input=[{...candidate("hidden","b"),eligible:false},candidate("plain")];
    expect(buildOfflineBrainMixedFeedV1(input,[brain("b",1)],options).map(x=>x.candidate.id)).toEqual(["plain"]);
  });
  it("rejects missing or duplicate graph identities and invalid weights",()=>{
    expect(()=>buildOfflineBrainMixedFeedV1([candidate("x","missing")],[],options)).toThrow(RangeError);
    expect(()=>buildOfflineBrainMixedFeedV1([candidate("x","b")],[brain("b",1),brain("b",1)],options)).toThrow(RangeError);
    expect(()=>buildOfflineBrainMixedFeedV1([],[],{...options,graphWeight:NaN})).toThrow(RangeError);
  });
});
