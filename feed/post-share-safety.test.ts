import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("keeps duplicate-post and local-only direct sharing paused while link sharing remains available", () => {
  const source = readFileSync(new URL("./PostCard.tsx", import.meta.url), "utf8");
  expect(source).toContain('const UNSAFE_POST_SHARING_ENABLED = false');
  for (const handler of ["handleShareAsPost", "handleShareToCircle", "handleShareToFollower"]) {
    expect(source).toMatch(new RegExp(`const ${handler} = async [\\s\\S]*?if \\(!UNSAFE_POST_SHARING_ENABLED\\) return;`));
  }
  expect(source).toContain('disabled={!UNSAFE_POST_SHARING_ENABLED} onClick={() => void handleShareAsPost()}');
  expect(source).toContain("handleCopyPostLink");
});
