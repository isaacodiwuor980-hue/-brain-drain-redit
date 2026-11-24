import { api } from "../api-client";

/** Limited experimental feed-interest preference only, NOT site-wide privacy. */
export type FeedPrivacySetting = {enabled:boolean;scope:"proposed-feed-interests-only"};
function auth(token:string) {
  if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token)) throw new Error("Authentication required");
  return {Authorization:`Bearer ${token}`};
}

/**
 * Adapter for the proposed server endpoint; not wired into UI or live feed.
 * The server must resolve the account; no UUID is accepted here. No automatic
 * retry, token refresh, offline queue or cross-user deduplication: a timeout can
 * leave write outcome unknown and callers must reconcile after reauthentication.
 * This does not provide analytics erasure, interest sync or production privacy.
 */
export async function readFeedPrivacy(token:string):Promise<FeedPrivacySetting> {
  const value=await api.request<unknown>("/api/feed-privacy",{method:"GET",headers:auth(token),cache:"no-store",dedupe:false,retries:0});
  if (!value || typeof value!=="object" || typeof (value as FeedPrivacySetting).enabled!=="boolean" || (value as FeedPrivacySetting).scope!=="proposed-feed-interests-only") throw new Error("Invalid feed privacy response");
  return {enabled:(value as FeedPrivacySetting).enabled,scope:"proposed-feed-interests-only"};
}
export async function setFeedPrivacy(token:string,enabled:boolean):Promise<void> {
  if (typeof enabled!=="boolean") throw new Error("Invalid preference");
  await api.request<void>("/api/feed-privacy",{method:"PUT",headers:auth(token),json:{enabled},retries:0});
}
export async function clearFeedInterests(token:string):Promise<void> {
  await api.request<void>("/api/feed-privacy",{method:"DELETE",headers:auth(token),retries:0});
}
