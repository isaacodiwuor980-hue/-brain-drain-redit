/** Browser connectivity is only a hint; the server can still be unreachable. */
export function mayStartVote(status:"online"|"offline",browserOnline:boolean):boolean {
  return status === "online" && browserOnline;
}
