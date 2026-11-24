import { beforeEach, describe, expect, it, vi } from "vitest";
const client=vi.hoisted(()=>({request:vi.fn()}));
vi.mock("../api-client",()=>({api:client}));
import { readFeedPrivacy, setFeedPrivacy, clearFeedInterests } from "./feed-privacy-sync";

beforeEach(()=>vi.resetAllMocks());
describe("feed-interest preference sync client",()=>{
  it("reads the narrow server setting without cross-user GET deduplication",async()=>{
    client.request.mockResolvedValue({enabled:true,scope:"proposed-feed-interests-only"});
    expect(await readFeedPrivacy("synthetic-token")).toEqual({enabled:true,scope:"proposed-feed-interests-only"});
    expect(client.request).toHaveBeenCalledWith("/api/feed-privacy",expect.objectContaining({method:"GET",dedupe:false,headers:{Authorization:"Bearer synthetic-token"},cache:"no-store"}));
  });
  it("rejects an invalid or unexpectedly broad response instead of claiming privacy success",async()=>{
    for(const response of [null,{enabled:"false",scope:"proposed-feed-interests-only"},{enabled:true,scope:"all-tracking"}]) {
      client.request.mockResolvedValueOnce(response);
      await expect(readFeedPrivacy("synthetic-token")).rejects.toThrow();
    }
  });
  it("sends only a boolean, never a caller-chosen account id, and does not silently retry writes",async()=>{
    client.request.mockResolvedValue(undefined);
    await setFeedPrivacy("synthetic-token",false);
    expect(client.request).toHaveBeenCalledWith("/api/feed-privacy",expect.objectContaining({method:"PUT",json:{enabled:false},retries:0}));
    await clearFeedInterests("synthetic-token");
    expect(client.request).toHaveBeenLastCalledWith("/api/feed-privacy",expect.objectContaining({method:"DELETE",retries:0}));
  });
  it("fails closed without a token and propagates failures without reporting success",async()=>{
    await expect(readFeedPrivacy("")).rejects.toThrow();
    expect(client.request).not.toHaveBeenCalled();
    client.request.mockRejectedValue(new Error("synthetic failure"));
    await expect(setFeedPrivacy("synthetic-token",false)).rejects.toThrow("synthetic failure");
  });
});
