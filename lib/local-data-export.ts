import { idb } from "./db";

// This deliberately retains the previous export selection and is not an
// account-scoped backup. Cloud, other browser stores, and unlisted IDB stores
// are excluded. Fail rather than represent an unreadable store as empty.
export const LOCAL_EXPORT_STORES = ["profile", "settings", "posts", "topics", "brains", "nodes", "missions", "milestones", "comments", "conversations", "messages", "notifications", "communities", "checkins", "pathways", "books", "analytics_events"] as const;
export async function collectLocalExport() {
  const data: Record<string, unknown[]> = {};
  for (const store of LOCAL_EXPORT_STORES) data[store] = await idb.getAllStrict(store);
  return {
    exportedAt: new Date().toISOString(),
    scope: "selected-local-browser-stores-only",
    notice: "This is not a complete account export. Cloud data, other browser storage and unlisted local stores are not included. Local data may include more than one account.",
    includedStores: [...LOCAL_EXPORT_STORES],
    data,
  };
}
