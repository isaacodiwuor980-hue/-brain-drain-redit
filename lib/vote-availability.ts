/**
 * Intentionally hard-disabled until identity, permissions, idempotency,
 * privacy and all writers are reviewed. Not a configurable client feature
 * flag or a server security boundary. The backend and database must enforce
 * their own independent protections.
 */
export function votingAvailable(): boolean { return false; }
