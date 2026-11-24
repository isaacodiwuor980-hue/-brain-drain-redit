import { buildOfflineFeed, type FeedCandidate } from "./feed-pipeline";

/** Synthetic/unwired inputs; neither eligibility nor signals are verified here. */
export type MixedCandidateV4 = FeedCandidate & Readonly<{
  eligible: boolean;
  rising: number | null;
  discovery: number | null;
  creatorExposures: number | null;
  topicExposures: number | null;
}>;
type Section = "top" | "rising" | "fairness" | "discovery";
type Mix = Record<Section, number>;
type Options = Readonly<{
  pageSize: number; seed: number; qualityWeight: number; minQuality: number;
  personalized: boolean; interests?: ReadonlyMap<string, number>;
}>;
const sections: Section[] = ["top", "rising", "fairness", "discovery"];
const percentages: Mix = {top:70,rising:15,fairness:10,discovery:5};
function unit(n: number) { return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1; }
function exposure(n: number | null) { return n === null || (Number.isSafeInteger(n) && n >= 0); }

/** Largest remainder; ties favor the section order above, not a fairness guarantee. */
export function allocateOfflineMixV4(pageSize: number): Mix {
  if (!Number.isSafeInteger(pageSize) || pageSize < 0 || pageSize > 1000) throw new RangeError("Invalid page size");
  const counts: Mix = {top:0,rising:0,fairness:0,discovery:0};
  for (const section of sections) counts[section] = Math.floor(pageSize * percentages[section] / 100);
  const remainder = pageSize - sections.reduce((sum,section) => sum + counts[section],0);
  const order = [...sections].sort((a,b) => (pageSize * percentages[b] % 100) - (pageSize * percentages[a] % 100) || sections.indexOf(a)-sections.indexOf(b));
  for (let i=0;i<remainder;i++) counts[order[i]]++;
  return counts;
}

/**
 * Offline-only allocation experiment, no production callers, database, ML or
 * side effects. Inputs are assumptions, not authorization, verified quality,
 * views, expertise or truth. Caller must establish visibility/moderation and
 * provenance; eligible=true is NOT a security boundary. Unknown exposure excludes
 * the fairness pool rather than pretending zero; no real fairness is guaranteed.
 * Reserved sections are selected discovery, fairness, rising first to avoid
 * top consuming them. Shortages backfill top from remaining eligible items;
 * section order is grouped rather than interleaved. No cursor, cross-page caps,
 * thresholds for rising/novelty, audited metrics or production fallback exists.
 * qualityWeight, minQuality and seed are explicit experiments, not policy.
 */
export function buildOfflineMixedFeedV4(candidates: readonly MixedCandidateV4[], options: Options): {candidate: MixedCandidateV4; section: Section}[] {
  const quotas=allocateOfflineMixV4(options.pageSize);
  if (!Array.isArray(candidates) || !Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff ||
      !unit(options.qualityWeight) || !unit(options.minQuality) || typeof options.personalized !== "boolean") throw new RangeError("Invalid mix inputs");
  let interests: Map<string,number> | undefined;
  if (options.personalized) {
    if (!(options.interests instanceof Map)) throw new RangeError("Interest snapshot required");
    interests = new Map();
    for (const [topic,score] of options.interests) {
      if (typeof topic !== "string" || !topic.trim() || !unit(score)) throw new RangeError("Invalid interest snapshot");
      interests.set(topic,score);
    }
  }
  const ids=new Set<string>();
  for (const c of candidates) {
    if (!c || typeof c.id!=="string" || !c.id || ids.has(c.id) || typeof c.topic!=="string" || !c.topic || typeof c.author!=="string" || !c.author || typeof c.source!=="string" || !c.source ||
        !c.signals || !unit(c.signals.quality) || !unit(c.signals.relevance) || typeof c.eligible!=="boolean" ||
        (c.rising!==null && !unit(c.rising)) || (c.discovery!==null && !unit(c.discovery)) || !exposure(c.creatorExposures) || !exposure(c.topicExposures)) throw new RangeError("Invalid candidate");
    ids.add(c.id);
  }
  const available=candidates.filter(c=>c.eligible && c.signals.quality>=options.minQuality);
  const byId=new Map(available.map(c=>[c.id,c]));
  const selected=new Set<string>();
  const picked: Record<Section,MixedCandidateV4[]> = {top:[],rising:[],fairness:[],discovery:[]};
  const rank=(pool: MixedCandidateV4[], score: (c: MixedCandidateV4)=>number) => buildOfflineFeed(pool,{seed:options.seed,rules:c=>score(byId.get(c.id)!)}).map(c=>byId.get(c.id)!);
  const pick=(section: Section, pool: MixedCandidateV4[], count: number, score: (c: MixedCandidateV4)=>number) => {
    for (const item of rank(pool.filter(c=>!selected.has(c.id)),score).slice(0,count)) { selected.add(item.id); picked[section].push(item); }
  };
  const topScore=(c:MixedCandidateV4)=>options.qualityWeight*c.signals.quality+(1-options.qualityWeight)*(interests ? (interests.get(c.topic) ?? 0.5) : c.signals.relevance);
  pick("discovery",available.filter(c=>c.discovery!==null),quotas.discovery,c=>c.discovery!);
  pick("fairness",available.filter(c=>c.creatorExposures!==null && c.topicExposures!==null),quotas.fairness,c=>(1/(1+c.creatorExposures!)+1/(1+c.topicExposures!))/2);
  pick("rising",available.filter(c=>c.rising!==null),quotas.rising,c=>c.rising!);
  // Include any shortage in the top section; never add ineligible candidates.
  pick("top",available,options.pageSize-selected.size,topScore);
  return sections.flatMap(section=>picked[section].map(candidate=>({candidate,section})));
}
