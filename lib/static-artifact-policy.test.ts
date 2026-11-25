import { describe, expect, it } from "vitest";
import { isPrivateBuildArtifact } from "./static-artifact-policy";

describe("production static artifact policy", () => {
  it.each(["/server.cjs", "/server.cjs.map", "/assets/app.js.map", "/%73erver.cjs", "/assets/app.js%2emap", "/assets/%2e%2e/server.cjs"])("blocks server and sourcemap artifacts: %s", path => {
    expect(isPrivateBuildArtifact(path)).toBe(true);
  });
  it.each(["/", "/assets/app-abcdef12.js", "/.well-known/assetlinks.json", "/my-server.cjs-notes"])("allows normal assets: %s", path => {
    expect(isPrivateBuildArtifact(path)).toBe(false);
  });
  it("rejects malformed percent encodings", () => { expect(isPrivateBuildArtifact("/%" )).toBe(true); });
});
