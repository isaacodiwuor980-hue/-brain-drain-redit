import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./config", () => ({ config: { supabase: { url: "https://example.test", serviceRoleKey: "test-only", isConfigured: true } } }));
import { supabase } from "./supabase";
afterEach(()=>vi.unstubAllGlobals());
describe("PostgREST ordering serialization",()=>{
  it("encodes each sort key in order while preserving pagination",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response("[]",{status:200}));vi.stubGlobal("fetch",fetchMock);
    await supabase.get("posts",{order:[{column:"created_at",ascending:false},{column:"id",ascending:true}],limit:21,offset:20});
    const url=new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    expect(url.searchParams.get("limit")).toBe("21");expect(url.searchParams.get("offset")).toBe("20");
  });
  it("preserves existing single-column ordering",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response("[]",{status:200}));vi.stubGlobal("fetch",fetchMock);
    await supabase.get("posts",{order:{column:"created_at",ascending:false}});
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("order")).toBe("created_at.desc");
  });
});
