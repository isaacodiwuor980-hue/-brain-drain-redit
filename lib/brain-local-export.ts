import { idb } from "./db";
import type { Brain, Node } from "./types";

/** Local, unscoped and potentially multi-account; not a cloud backup. */
export async function collectLocalBrainExport(brainId?: string) {
  // One strict read transaction: do not produce plausible partial data on a
  // blocked store or mix the brains and nodes from different local moments.
  const { brains, nodes } = await idb.readBrainExportSnapshot<Brain, Node>(brainId);
  return {
    brains,
    nodes,
    notice: "This export contains browser data, potentially from more than one account. Metadata-only cloud stubs may not contain nodes. It excludes cloud and other local data and is not a complete backup.",
  };
}
