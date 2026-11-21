import { idb } from "./db";
import { env } from "./env";
import { getAuthToken } from "./auth-token";
import { deleteBrain as deleteBrainApi, isBrainsError } from "./api/brains";

export type BrainDeletionResult = { cloud: "deleted" | "not-found" | "unconfirmed" };

/** Delete local data durably, then attempt a cloud deletion if signed in.
 * An unconfirmed cloud deletion is NOT queued and may reappear on refresh. */
export async function deleteBrainData(brainId: string): Promise<BrainDeletionResult> {
  await idb.deleteBrainWithNodes(brainId);
  if (!env.apiEnabled) return { cloud: "unconfirmed" };
  try {
    const token = await getAuthToken();
    if (!token) return { cloud: "unconfirmed" };
    await deleteBrainApi(brainId, token);
    return { cloud: "deleted" };
  } catch (error) {
    if (isBrainsError(error, 404)) return { cloud: "not-found" };
    console.warn("Local brain deleted; cloud deletion was not confirmed.", error);
    return { cloud: "unconfirmed" };
  }
}
