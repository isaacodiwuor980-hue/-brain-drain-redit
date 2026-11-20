import { idb } from "./db";
import { env } from "./env";
import { getAuthToken } from "./auth-token";
import { getBrain } from "./api/brains";
import type { Brain, BrainData, Node } from "./types";

type CachedBrain = Brain & { __cloudMetadataOnly?: boolean };

/** Load local data, fetching cloud details only for an explicitly marked stub.
 * Never replace a local brain while an async request is in flight. */
export async function loadBrainData(brainId: string): Promise<BrainData | null> {
  const brain = await idb.get<CachedBrain>("brains", brainId);
  if (!brain) return null;
  if (brain.__cloudMetadataOnly) {
    if (!env.apiEnabled) throw new Error("This brain needs an internet connection to load its nodes.");
    const token = await getAuthToken();
    const detail = await getBrain(brainId, undefined, token);
    if (!detail?.brain || detail.brain.id !== brainId || !Array.isArray(detail.nodes)) {
      throw new Error("The server returned invalid brain data.");
    }
    await idb.hydrateCloudBrain(brain, detail.brain, detail.nodes);
    // The stub may have changed while the network request was in flight.
    // Return the current local version, never the now-stale response.
    const latest = await idb.get<CachedBrain>("brains", brainId);
    if (!latest) return null;
    if (latest.__cloudMetadataOnly) throw new Error("Could not safely load this brain. Please try again.");
    const nodes = await idb.getAllByIndex<Node>("nodes", "brain_id", brainId);
    return { brain: latest, nodes };
  }
  const nodes = await idb.getAllByIndex<Node>("nodes", "brain_id", brainId);
  return { brain, nodes };
}
