import { idb } from "./db";
import type { Brain, Node } from "./types";

/** Local, unscoped and potentially multi-account; not a cloud backup. */
export async function collectLocalBrainExport() {
  // Keep the top-level arrays for the existing import format. A failed read
  // must reject instead of producing a plausible but incomplete download.
  const brains = await idb.getAllStrict<Brain>("brains");
  const nodes = await idb.getAllStrict<Node>("nodes");
  return {
    brains,
    nodes,
    notice: "This export includes browser brains and nodes, potentially from more than one account. It excludes cloud and other local data and is not a complete backup. Reads are not an atomic snapshot.",
  };
}
