/**
 * Offline policy model, not authorization or a live write boundary.
 * Callers must obtain the current state under a server-side lock/version check;
 * all writers must enforce the same policy. A client-side check cannot do that.
 * Same-state requests are allowed here, but this does not define toggle behavior
 * or idempotent replay semantics.
 */
export function evaluateTwoStepVoteV1(
  current: string | null,
  desired: string | null,
  choices: readonly [string, string],
): "allowed" | "remove_first" | "invalid" {
  const [first, second] = choices;
  if (!first || !second || first === second) return "invalid";
  const valid = (value: string | null) => value === null || value === first || value === second;
  if (!valid(current) || !valid(desired)) return "invalid";
  return current !== null && desired !== null && current !== desired ? "remove_first" : "allowed";
}
