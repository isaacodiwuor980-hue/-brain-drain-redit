// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOfflineQueueStrict, queueOfflineAction, saveOfflineQueue } from "./offline-sync";
const key="brainbuilder_offline_queue";
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});
describe("offline queue storage failure containment",()=>{
  it.each(["{broken", JSON.stringify([{id:"missing-fields"}]), JSON.stringify({unexpected:true})])("does not overwrite an unreadable queue",raw=>{
    localStorage.setItem(key,raw);
    expect(getOfflineQueueStrict()).toBeNull();
    expect(queueOfflineAction("create_post",{postId:"p"},"a")).toBe(false);
    expect(saveOfflineQueue([])).toBe(false);
    expect(localStorage.getItem(key)).toBe(raw);
  });
  it("reports quota failures instead of claiming a queued action was saved",()=>{
    const storage={getItem:vi.fn().mockReturnValue(null),setItem:vi.fn(()=>{throw new Error("quota");})};
    vi.stubGlobal("localStorage",storage);
    expect(queueOfflineAction("create_post",{postId:"p"},"a")).toBe(false);
  });
  it("saves a valid queue and retains a new action",()=>{
    expect(queueOfflineAction("create_post",{postId:"p"},"a")).toBe(true);
    expect(getOfflineQueueStrict()).toHaveLength(1);
  });
});
