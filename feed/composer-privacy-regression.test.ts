import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
it("does not automatically expose, overwrite or erase unscoped legacy drafts",()=>{
  const source=readFileSync(new URL("./PostCreator.tsx",import.meta.url),"utf8");
  expect(source).not.toContain('localStorage.getItem("postCreatorDraft")');
  expect(source).not.toContain('localStorage.setItem("postCreatorDraft"');
  expect(source).not.toContain('localStorage.removeItem("postCreatorDraft")');
  expect(source).toContain("hasComposerUnsavedWork");
  expect(source).toContain("window.confirm");
  expect(source).not.toContain('title: "Draft saved"');
  expect(source).not.toContain('idb.getAll<Post>("posts")');
  expect(source).toContain('idb.saveBrainWithNodes(data.brain, data.nodes)');
});
