/** @vitest-environment happy-dom */
import { useEffect, act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../lib/types";
const m=vi.hoisted(()=>({session:vi.fn(),putStrict:vi.fn(),getAll:vi.fn(),create:vi.fn(),queue:vi.fn(),toast:vi.fn(),track:vi.fn()}));
vi.mock("../lib/db",()=>({idb:{getAll:m.getAll,putStrict:m.putStrict}}));
vi.mock("../lib/auth-token",()=>({getAuthSession:m.session,getAuthToken:vi.fn()}));
vi.mock("../lib/api/feed",()=>({fetchFeed:vi.fn().mockResolvedValue({posts:[],hasMore:false}),createPost:m.create,toCreatePostInput:(post:Post)=>({id:post.id}),reactToPost:vi.fn(),isApiError:()=>false}));
vi.mock("../lib/offline-sync",()=>({queueOfflineAction:m.queue}));
vi.mock("../lib/analytics",()=>({trackEvent:m.track}));
vi.mock("./use-online-status",()=>({useOnlineStatus:()=>"online"}));
vi.mock("./use-toast",()=>({useToast:()=>({toast:m.toast})}));
import { useSocial } from "./use-social";
let api:ReturnType<typeof useSocial>, client:QueryClient, root:ReturnType<typeof createRoot>, el:HTMLDivElement;
function Probe(){const value=useSocial();useEffect(()=>{api=value;});return null;}
const post={id:"p",userId:"a",content:"synthetic",topicId:"t",createdAt:1,reactions:{}} as Post;
beforeEach(async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.clearAllMocks();m.getAll.mockResolvedValue([]);m.putStrict.mockResolvedValue(undefined);m.track.mockResolvedValue(undefined);m.create.mockResolvedValue({});
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});el=document.createElement("div");document.body.append(el);root=createRoot(el);
  await act(async()=>root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>));
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();el.remove();});
describe("post sending on account change",()=>{
  it("retains locally but does not send or transfer to an account that differs from the post owner",async()=>{
    m.session.mockResolvedValue({uid:"b",token:"token-b"});
    await act(async()=>{await api.addPost(post);});
    expect(m.putStrict).toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(m.queue).not.toHaveBeenCalled();
  });
  it("does not send if the account switches between session checks",async()=>{
    m.session.mockResolvedValueOnce({uid:"a",token:"token-a"}).mockResolvedValueOnce({uid:"b",token:"token-b"});
    await act(async()=>{await api.addPost(post);});
    expect(m.create).not.toHaveBeenCalled();expect(m.queue).not.toHaveBeenCalled();
  });
  it("retains an uncertain failed send under the original owner, without replay",async()=>{
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    m.create.mockRejectedValueOnce(new Error("lost response"));
    await act(async()=>{await api.addPost(post);});
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.queue).toHaveBeenCalledWith("create_post",{postId:"p"},"a");
  });
  it("does not send if local storage fails",async()=>{
    m.putStrict.mockRejectedValueOnce(new Error("quota"));
    await act(async()=>{await expect(api.addPost(post)).rejects.toThrow("quota");});
    expect(m.create).not.toHaveBeenCalled();expect(m.queue).not.toHaveBeenCalled();
  });
  it("sends only when both checks match the post owner",async()=>{
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    await act(async()=>{await api.addPost(post);});
    expect(m.create).toHaveBeenCalledWith({id:"p"},"token-a");
  });
});
