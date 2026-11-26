/** Server output and sourcemaps must not be published by the Express static host. */
export function isPrivateBuildArtifact(path: string): boolean {
  try {
    const decoded = decodeURIComponent(path).replace(/\\/g, "/");
    return decoded.split("/").some(segment => segment.toLowerCase() === "server.cjs" || segment.toLowerCase().endsWith(".map"));
  } catch {
    return true;
  }
}
