/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({getAll:vi.fn(),putAll:vi.fn(),fetchFeed:vi.fn()}));
vi.mock("../lib/db",()=>({idb:{getAll:m.getAll,putAll:m.putAll}}));
vi.mock("../lib/api/feed",()=>({fetchFeed:m.fetchFeed,createPost:vi.fn(),toCreatePostInput:vi.fn(),reactToPost:vi.fn(),isApiError:()=>false}));
vi.mock("./use-online-status",()=>({useOnlineStatus:()=>"online"}));
vi.mock("./use-toast",()=>({useToast:()=>({toast:vi.fn()})}));
import { useSocial } from "./use-social";
const cached={id:"p",userId:"author",topicId:"t",content:"synthetic",createdAt:1,reactions:{upvote:7,downvote:2,repost:1},upvotes:7,userReactions:{upvote:["other-account"]}};
let client:QueryClient,root:ReturnType<typeof createRoot>,el:HTMLDivElement;
function Probe(){useSocial();return null;}
beforeEach(async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.clearAllMocks();m.getAll.mockResolvedValue([cached]);m.putAll.mockResolvedValue(undefined);m.fetchFeed.mockResolvedValue({posts:[{...cached,content:"server"}],hasMore:false});
  client=new QueryClient({defaultOptions:{queries:{retry:false}}});el=document.createElement("div");document.body.append(el);root=createRoot(el);
  await act(async()=>{root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);});
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();el.remove();});
describe("feed query cache privacy",()=>{
  it("does not read or rewrite unscoped local posts when fetching the feed",async()=>{
    await vi.waitFor(()=>expect(client.getQueryData(["posts","foryou",null,"cursor-v1"])).toBeDefined());
    expect(m.getAll).not.toHaveBeenCalled();
    expect(m.putAll).not.toHaveBeenCalled();
    expect(JSON.stringify(client.getQueryData(["posts","foryou",null,"cursor-v1"]))).toContain("server");
  });
  it("does not include an unverified local-only post in an online feed",async()=>{
    m.getAll.mockResolvedValue([{...cached,id:"local-private",content:"sensitive cached draft"}]);
    await act(async()=>{await client.refetchQueries({queryKey:["posts","foryou",null,"cursor-v1"]});});
    const data=JSON.stringify(client.getQueryData(["posts","foryou",null,"cursor-v1"]));
    expect(data).not.toContain("sensitive cached draft"); expect(data).toContain("server");
  });
  it("hides unverified cached posts when the server cannot be reached",async()=>{
    m.getAll.mockResolvedValue([{...cached,id:"local-private",content:"sensitive cached draft"}]);
    m.fetchFeed.mockRejectedValueOnce(new Error("offline"));
    await act(async()=>{await client.refetchQueries({queryKey:["posts","foryou",null,"cursor-v1"]});});
    const data=JSON.stringify(client.getQueryData(["posts","foryou",null,"cursor-v1"]));
    expect(data).not.toContain("sensitive cached draft");
  });

  it("redacts the fallback query result when cloud fetch fails",async()=>{
    await vi.waitFor(()=>expect(client.getQueryData(["posts","foryou",null,"cursor-v1"])).toBeDefined());
    m.fetchFeed.mockRejectedValueOnce(new Error("offline"));
    await act(async()=>{await client.refetchQueries({queryKey:["posts","foryou",null,"cursor-v1"]});});
    const data=JSON.stringify(client.getQueryData(["posts","foryou",null,"cursor-v1"]));
    expect(data).not.toContain("other-account");expect(data).not.toContain("upvote");expect(data).not.toContain("downvote");
  });
  it("does not place voter identities or totals into the shared query result",async()=>{
    await vi.waitFor(()=>expect(client.getQueryData(["posts","foryou",null,"cursor-v1"])).toBeDefined());
    const data=JSON.stringify(client.getQueryData(["posts","foryou",null,"cursor-v1"]));
    expect(data).not.toContain("other-account");expect(data).not.toContain("upvote");expect(data).not.toContain("downvote");
    expect(cached.userReactions.upvote).toEqual(["other-account"]);
  });
});
