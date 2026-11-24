/**
 * Offline, aggregate-only identity planning experiment; no database, I/O, logs
 * or writes. Input pairs are ASSUMED to have been independently ownership-
 * reviewed. This function cannot verify ownership, approvals, snapshot freshness,
 * concurrent changes or identity provider credentials. It must not be used to
 * provision accounts. Never infer links from matching email or client input.
 */
type Pair = Readonly<{ subject: string; uuid: string }>;
type LinkPlanCounts = { total: number; unchanged: number; proposed: number; invalid: number; duplicate: number; missingUser: number; conflict: number };
const subjectPattern = /^[A-Za-z0-9_-]{1,128}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function valid(pair: Pair): boolean {
  return !!pair && typeof pair.subject === "string" && subjectPattern.test(pair.subject) && typeof pair.uuid === "string" && uuidPattern.test(pair.uuid);
}

/** Counts input records only; identifiers and proposed mappings are not returned. */
export function summarizeIdentityLinkPlan(pairs: readonly Pair[], existing: readonly Pair[], knownUsers: ReadonlySet<string>): LinkPlanCounts {
  if (!Array.isArray(pairs) || !Array.isArray(existing) || !(knownUsers instanceof Set)) throw new RangeError("Invalid planning input");
  const users = new Set<string>();
  for (const uuid of knownUsers) {
    if (typeof uuid !== "string" || !uuidPattern.test(uuid)) throw new RangeError("Invalid user snapshot");
    users.add(uuid.toLowerCase());
  }
  const bySubject = new Map<string, string>(), byUuid = new Map<string, string>();
  for (const row of existing) {
    if (!valid(row)) throw new RangeError("Invalid mapping snapshot");
    const uuid = row.uuid.toLowerCase();
    if (bySubject.has(row.subject) || byUuid.has(uuid) || !users.has(uuid)) throw new RangeError("Conflicting mapping snapshot");
    bySubject.set(row.subject, uuid); byUuid.set(uuid, row.subject);
  }
  const subjectCounts = new Map<string, number>(), uuidCounts = new Map<string, number>();
  for (const row of pairs) {
    // A partially malformed row can still make a valid subject or UUID
    // ambiguous, so include each valid identifier independently.
    if (row && typeof row.subject === "string" && subjectPattern.test(row.subject)) subjectCounts.set(row.subject, (subjectCounts.get(row.subject) ?? 0) + 1);
    if (row && typeof row.uuid === "string" && uuidPattern.test(row.uuid)) {
      const uuid = row.uuid.toLowerCase();
      uuidCounts.set(uuid, (uuidCounts.get(uuid) ?? 0) + 1);
    }
  }
  const result: LinkPlanCounts = { total: pairs.length, unchanged: 0, proposed: 0, invalid: 0, duplicate: 0, missingUser: 0, conflict: 0 };
  for (const row of pairs) {
    if (!valid(row)) { result.invalid++; continue; }
    const uuid = row.uuid.toLowerCase();
    if (subjectCounts.get(row.subject)! > 1 || uuidCounts.get(uuid)! > 1) { result.duplicate++; continue; }
    if (!users.has(uuid)) { result.missingUser++; continue; }
    const current = bySubject.get(row.subject), owner = byUuid.get(uuid);
    if ((current !== undefined && current !== uuid) || (owner !== undefined && owner !== row.subject)) { result.conflict++; continue; }
    if (current === uuid) result.unchanged++; else result.proposed++;
  }
  return result;
}
