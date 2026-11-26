import { idb } from "./db";

export type BrainDeletionResult = { cloud: "paused" };

/** Local records have no verified account owner, so an ID from this device
 * must not be used to delete whichever account's cloud copy happens to match.
 * Local deletion is durable; no cloud request or automatic retry is made. */
export async function deleteBrainData(brainId: string): Promise<BrainDeletionResult> {
  await idb.deleteBrainWithNodes(brainId);
  return { cloud: "paused" };
}
