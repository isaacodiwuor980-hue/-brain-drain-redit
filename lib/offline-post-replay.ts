import type {QueuedAction} from "./offline-sync";
import type {Post} from "./types";
/** Local consistency check only; browser-owned data does not prove identity. */
export function validateOfflinePostReplay(action:QueuedAction,post:Post|undefined,active:string):Post {
  const id=action.payload?.postId;
  if (action.type!=="create_post" || typeof active!=="string" || !active || action.ownerId!==active || typeof id!=="string" || !id || id.length>120) throw new Error("Offline post requires review");
  // Missing data cannot prove that the user intentionally deleted it.
  if (!post || post.id!==id || post.userId!==active) throw new Error("Offline post requires review");
  return post;
}
