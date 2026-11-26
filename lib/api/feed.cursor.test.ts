import { beforeEach, describe, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock("../api-client",()=>({api:mock,ApiError:class extends Error{status=500;}}));
import { fetchFeed } from "./feed";
beforeEach(()=>vi.resetAllMocks());
describe("feed cursor client",()=>{
  it("passes a validated exact cursor and does not request offset paging",async()=>{
    mock.get.mockResolvedValue({posts:[],hasMore:false,source:'foryou'});
    await fetchFeed({mode:'foryou',cursor:{id:'p-2',createdAt:'2026-11-16T12:00:00.123456+00:00'}});
    const [path,options]=mock.get.mock.calls[0];const url=new URL(path,'https://example.test');
    expect(url.searchParams.get('cursorCreatedAt')).toBe('2026-11-16T12:00:00.123456+00:00');
    expect(url.searchParams.get('cursorId')).toBe('p-2');expect(url.searchParams.has('offset')).toBe(false);expect(options.cache).toBe('no-store');
  });
  it("does not silently fall back to offsets when a server omits or corrupts a next cursor",async()=>{
    for(const cursor of [undefined,{id:'bad")',createdAt:'2026-11-16T12:00:00Z'}]) {
      mock.get.mockResolvedValueOnce({posts:[],hasMore:true,nextCursor:cursor});
      await expect(fetchFeed()).rejects.toThrow('Invalid feed pagination response');
    }
  });
  it("rejects unsafe cursor inputs before any request",async()=>{
    await expect(fetchFeed({cursor:{id:'bad)',createdAt:'2026-11-16T12:00:00Z'}})).rejects.toThrow('Invalid feed cursor');
    await expect(fetchFeed({offset:2,cursor:{id:'p',createdAt:'2026-11-16T12:00:00Z'}})).rejects.toThrow();
    expect(mock.get).not.toHaveBeenCalled();
  });
});
