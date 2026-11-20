/**
 * Room migration — pure derivation helpers.
 *
 * Kept in their own module so the core Room semantics (role + visibility
 * mapping) are unit-testable without rendering React. The Community page
 * imports these; the logic itself has no UI or storage dependencies.
 */

export type RoomRole = "steward" | "curator" | "contributor" | "observer";
export type RoomVisibility = "open" | "gated" | "sealed";

/**
 * Derive the viewer's Room role for display and gating.
 * - A stored `role` always wins.
 * - Otherwise a member defaults to "contributor".
 * - Non-members (not_member / pending) return null — no badge, read-only.
 *
 * Note: in the local-first model the `role` lives on the current user's
 * Community record, so this reflects the viewer's own role on this device.
 * Cross-user role assignment requires the cloud-sync phase.
 */
export function getRoomRole(community: { role?: string; joinStatus?: string }): RoomRole | null {
  if (community.role) return community.role as RoomRole;
  if (community.joinStatus === "member") return "contributor";
  return null;
}

/**
 * Derive Room visibility from the stored `visibility` when present, else from
 * the legacy `privacy` field:
 *   public     → open
 *   restricted → gated
 *   private    → sealed (label only — no crypto in Phases 1–7)
 * Defaults to "open" when neither is set.
 */
export function getRoomVisibility(
  community: { visibility?: string; privacy?: string },
): RoomVisibility {
  if (community.visibility) return community.visibility as RoomVisibility;
  if (community.privacy === "restricted") return "gated";
  if (community.privacy === "private") return "sealed";
  return "open";
}
