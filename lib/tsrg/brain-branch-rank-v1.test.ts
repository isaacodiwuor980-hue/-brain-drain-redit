import { describe, expect, it } from "vitest";
import { rankOfflineBrainBranchesV1, type OfflineBrainV1 } from "./brain-branch-rank-v1";

const brain: OfflineBrainV1 = {brainId:"brain-a", rootId:"root",nodes:[
  {id:"root",quality:0.2,relevance:0.4,edges:[{to:"left",weight:0.75},{to:"right",weight:0.25}]},
  {id:"left",quality:0.8,relevance:0.8,edges:[]},
  {id:"right",quality:0.4,relevance:0.4,edges:[]},
]};
const options={qualityWeight:0.5,damping:0.5};
describe("offline rules-based branch score",()=>{
  it("propagates edge-weighted child scores without changing inputs",()=>{
    const before=structuredClone(brain);
    const result=rankOfflineBrainBranchesV1([brain],options);
    expect(result.brains[0].totalScore).toBeCloseTo(0.3+0.5*(0.75*0.8+0.25*0.4));
    expect(result.branches.map(x=>x.nodeId)).toEqual(["left","right","root"]);
    expect(result.branches.find(x=>x.nodeId==="root")?.localScore).toBeCloseTo(0.3);
    expect(brain).toEqual(before);
    expect(rankOfflineBrainBranchesV1([brain],options)).toEqual(result);
  });
  it("handles a shared descendant as weighted paths, not as a unique visit count",()=>{
    const diamond:OfflineBrainV1={brainId:"diamond",rootId:"r",nodes:[
      {id:"r",quality:0,relevance:0,edges:[{to:"a",weight:0.5},{to:"b",weight:0.5}]},
      {id:"a",quality:0,relevance:0,edges:[{to:"c",weight:1}]},
      {id:"b",quality:0,relevance:0,edges:[{to:"c",weight:1}]},
      {id:"c",quality:1,relevance:1,edges:[]},
    ]};
    expect(rankOfflineBrainBranchesV1([diamond],options).brains[0].totalScore).toBeCloseTo(0.25);
  });
  it("ranks brains deterministically regardless of input ordering and rejects duplicate brain IDs",()=>{
    const b={...brain,brainId:"brain-b"};
    expect(rankOfflineBrainBranchesV1([b,brain],options)).toEqual(rankOfflineBrainBranchesV1([brain,b],options));
    expect(()=>rankOfflineBrainBranchesV1([brain,brain],options)).toThrow(RangeError);
  });
  it("rejects cycles, dangling or duplicate edges, disconnected nodes and invalid weights",()=>{
    const make=(rootEdges: {to:string;weight:number}[],leftEdges: {to:string;weight:number}[]=[])=>({...brain,nodes:[{...brain.nodes[0],edges:rootEdges},{...brain.nodes[1],edges:leftEdges},brain.nodes[2]]});
    for(const item of [make([{to:"left",weight:1},{to:"right",weight:0}],[{to:"root",weight:1}]),make([{to:"missing",weight:1}]),make([{to:"left",weight:0.5},{to:"left",weight:0.5}]),make([{to:"left",weight:0.8},{to:"right",weight:0.8}]),make([{to:"left",weight:1}]),make([{to:"left",weight:NaN},{to:"right",weight:0}])]) expect(()=>rankOfflineBrainBranchesV1([item],options)).toThrow(RangeError);
  });
  it("rejects malformed options, scores and overlarge graphs",()=>{
    expect(()=>rankOfflineBrainBranchesV1([brain],{...options,damping:NaN})).toThrow(RangeError);
    expect(()=>rankOfflineBrainBranchesV1([{...brain,nodes:[{...brain.nodes[0],quality:-1},...brain.nodes.slice(1)]}],options)).toThrow(RangeError);
    const nodes=Array.from({length:1001},(_,i)=>({id:`n-${i}`,quality:0,relevance:0,edges:[]}));
    expect(()=>rankOfflineBrainBranchesV1([{brainId:"large",rootId:"n-0",nodes}],options)).toThrow(RangeError);
  });
});
