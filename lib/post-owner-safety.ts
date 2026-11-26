/** A local author field is only a defensive equality check, never proof of
 * identity or server-side authorization. Legacy/guest IDs are not linkable. */
export function maySendPostAs(ownerId: string, session: {uid:string; token:string | null} | null): boolean {
  return Boolean(ownerId && ownerId !== "me" && !ownerId.startsWith("guest-") && session?.uid === ownerId && session.token);
}
