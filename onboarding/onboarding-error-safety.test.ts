import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("renders load failures before the missing-state fallback and warns that unsaved entries are window-only",()=>{
  const source=readFileSync(new URL("./OnboardingFlow.tsx",import.meta.url),"utf8");
  expect(source.indexOf("if (error) {")).toBeLessThan(source.indexOf("if (!state) {"));
  expect(source).not.toContain('phase === "loading" || !state');
  expect(source).toContain("Your entries remain in this window only");
});
