/** Offline synthetic comparison only; no I/O, ML, text, identities or live callers.
 * Inputs are supplied assumptions: this does not authenticate access, infer a
 * person's interest/expertise, verify truth, validate real edge probabilities,
 * implement opt-out or make moderation decisions. Filter and authorize before
 * scoring in any future integration, and never include private graphs otherwise.
 */
export type OfflineBrainV1 = Readonly<{
  brainId:string; rootId:string;
  nodes:readonly Readonly<{id:string; quality:number; relevance:number; edges:readonly Readonly<{to:string;weight:number}>[]}>[];
}>;
type Options=Readonly<{qualityWeight:number;damping:number}>;
type BrainScore=Readonly<{brainId:string;totalScore:number}>;
type BranchScore=Readonly<{brainId:string;nodeId:string;localScore:number;totalScore:number}>;
const validId=(s:unknown):s is string=>typeof s==="string" && s.trim().length>0 && s.length<=120;
const unit=(n:unknown):n is number=>typeof n==="number" && Number.isFinite(n) && n>=0 && n<=1;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;

/**
 * A rules-only, edge-weighted bottom-up DAG experiment. Branch local score is
 * an explicit blend of caller-supplied quality and relevance. Total is local +
 * damping * sum(edge weight * child total). Shared descendants contribute once
 * per weighted path; weights are not inferred or asserted to be probabilities.
 * Missing/invalid graphs fail closed; no recursion, graph size limits, stable
 * ties, and canonical edge order. Scores may exceed one and are not calibrated.
 * Constants/weights are experiments, not live policy or evidence of fairness.
 */
export function rankOfflineBrainBranchesV1(brains:readonly OfflineBrainV1[],options:Options):{brains:BrainScore[];branches:BranchScore[]} {
  if (!Array.isArray(brains) || brains.length>500 || !options || !unit(options.qualityWeight) || !unit(options.damping)) throw new RangeError("Invalid inputs");
  const seenBrains=new Set<string>(), brainScores:BrainScore[]=[], branchScores:BranchScore[]=[];
  let totalNodes=0, totalEdges=0;
  for (const brain of brains) {
    if (!brain || !validId(brain.brainId) || seenBrains.has(brain.brainId) || !validId(brain.rootId) || !Array.isArray(brain.nodes) || brain.nodes.length===0 || brain.nodes.length>1000) throw new RangeError("Invalid brain");
    seenBrains.add(brain.brainId); totalNodes+=brain.nodes.length;
    if (totalNodes>10000) throw new RangeError("Too many nodes");
    const nodes=new Map<string,OfflineBrainV1["nodes"][number]>();
    for (const node of brain.nodes) {
      if (!node || !validId(node.id) || nodes.has(node.id) || !unit(node.quality) || !unit(node.relevance) || !Array.isArray(node.edges)) throw new RangeError("Invalid node");
      totalEdges+=node.edges.length; if (totalEdges>20000) throw new RangeError("Too many edges");
      nodes.set(node.id,node);
    }
    if (!nodes.has(brain.rootId)) throw new RangeError("Missing root");
    const indegree=new Map([...nodes.keys()].map(id=>[id,0]));
    const edges=new Map<string,ReadonlyArray<Readonly<{to:string;weight:number}>>>();
    for (const node of nodes.values()) {
      const unique=new Set<string>(); let sum=0;
      for (const edge of node.edges) {
        if (!edge || !validId(edge.to) || !nodes.has(edge.to) || unique.has(edge.to) || !unit(edge.weight)) throw new RangeError("Invalid edge");
        unique.add(edge.to); sum+=edge.weight; indegree.set(edge.to,indegree.get(edge.to)!+1);
      }
      if (sum>1+1e-12) throw new RangeError("Edge weights exceed one");
      edges.set(node.id,[...node.edges].sort((a,b)=>compare(a.to,b.to)));
    }
    // A single root with all nodes reachable ensures disconnected graphs are
    // not silently included. Zero-weight edges remain structural connections.
    const reachable=new Set([brain.rootId]), stack=[brain.rootId];
    while (stack.length) for (const edge of edges.get(stack.pop()!)!) if (!reachable.has(edge.to)) {reachable.add(edge.to); stack.push(edge.to);}
    if (reachable.size!==nodes.size) throw new RangeError("Disconnected graph");
    const queue=[...indegree].filter(([,degree])=>degree===0).map(([id])=>id);
    const order:string[]=[];
    for (let i=0;i<queue.length;i++) {
      const id=queue[i]; order.push(id);
      for (const edge of edges.get(id)!) {const n=indegree.get(edge.to)!-1;indegree.set(edge.to,n);if(n===0)queue.push(edge.to);}
    }
    if (order.length!==nodes.size || order[0]!==brain.rootId) throw new RangeError("Cyclic graph");
    const totals=new Map<string,number>();
    for (let i=order.length-1;i>=0;i--) {
      const id=order[i], node=nodes.get(id)!;
      const localScore=options.qualityWeight*node.quality+(1-options.qualityWeight)*node.relevance;
      let childScore=0; for(const edge of edges.get(id)!) childScore+=edge.weight*totals.get(edge.to)!;
      const totalScore=localScore+options.damping*childScore;
      if (!Number.isFinite(totalScore)) throw new RangeError("Invalid result");
      totals.set(id,totalScore); branchScores.push({brainId:brain.brainId,nodeId:id,localScore,totalScore});
    }
    brainScores.push({brainId:brain.brainId,totalScore:totals.get(brain.rootId)!});
  }
  brainScores.sort((a,b)=>b.totalScore-a.totalScore||compare(a.brainId,b.brainId));
  branchScores.sort((a,b)=>b.localScore-a.localScore||compare(a.brainId,b.brainId)||compare(a.nodeId,b.nodeId));
  return {brains:brainScores,branches:branchScores};
}
