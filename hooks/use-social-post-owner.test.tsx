/** @vitest-environment happy-dom */
import { useEffect, act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Post } from "../lib/types";
const m=vi.hoisted(()=>({session:vi.fn(),putStrict:vi.fn(),getAll:vi.fn(),create:vi.fn(),queue:vi.fn(),toast:vi.fn(),track:vi.fn(),online:true}));
vi.mock("../lib/db",()=>({idb:{getAll:m.getAll,putStrict:m.putStrict}}));
vi.mock("../lib/auth-token",()=>({getAuthSession:m.session,getAuthToken:vi.fn()}));
vi.mock("../lib/api/feed",()=>({fetchFeed:vi.fn().mockResolvedValue({posts:[],hasMore:false}),createPost:m.create,toCreatePostInput:(post:Post)=>({id:post.id}),reactToPost:vi.fn(),isApiError:()=>false}));
vi.mock("../lib/offline-sync",()=>({queueOfflineAction:m.queue}));
vi.mock("../lib/analytics",()=>({trackEvent:m.track}));
vi.mock("./use-online-status",()=>({useOnlineStatus:()=>m.online ? "online" : "offline"}));
vi.mock("./use-toast",()=>({useToast:()=>({toast:m.toast})}));
import { useSocial } from "./use-social";
let api:ReturnType<typeof useSocial>, client:QueryClient, root:ReturnType<typeof createRoot>, el:HTMLDivElement;
function Probe(){const value=useSocial();useEffect(()=>{api=value;});return null;}
const post={id:"p",userId:"a",content:"synthetic",topicId:"t",createdAt:1,reactions:{}} as Post;
beforeEach(async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.clearAllMocks();m.online=true;m.queue.mockReturnValue(true);m.getAll.mockResolvedValue([]);m.putStrict.mockResolvedValue(undefined);m.track.mockResolvedValue(undefined);m.create.mockResolvedValue({});
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});el=document.createElement("div");document.body.append(el);root=createRoot(el);
  await act(async()=>root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>));
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();el.remove();});
describe("post sending on account change",()=>{
  it("does not show previously loaded feed results when connectivity changes to offline",async()=>{
    client.setQueryData(["posts","foryou",null],{pages:[{posts:[post],hasMore:false}],pageParams:[0]});
    await act(async()=>{await client.invalidateQueries({queryKey:["posts","foryou",null],refetchType:"none"});});
    m.online=false;
    await act(async()=>root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>));
    expect(api.posts).toEqual([]);
  });
  it("holds an offline post for review without a network send",async()=>{
    m.online=false;
    await act(async()=>root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>));
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    await act(async()=>{await api.addPost(post);});
    expect(m.putStrict).toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
    expect(m.queue).toHaveBeenCalledWith("create_post",{postId:"p"},"a");
  });
  it("warns when the review entry cannot be stored",async()=>{
    m.online=false; m.queue.mockReturnValue(false);
    await act(async()=>root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>));
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    await act(async()=>{await api.addPost(post);});
    expect(m.create).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({title:"Review storage unavailable"}));
  });
  it("holds the post if connectivity drops while the session is rechecked",async()=>{
    const status=vi.spyOn(navigator,"onLine","get").mockReturnValue(true);
    try {
      m.session.mockResolvedValueOnce({uid:"a",token:"token-a"}).mockImplementationOnce(async()=>{
        status.mockReturnValue(false); return {uid:"a",token:"token-a"};
      });
      await act(async()=>{await api.addPost(post);});
      expect(m.create).not.toHaveBeenCalled();expect(m.queue).toHaveBeenCalledWith("create_post",{postId:"p"},"a");
    } finally {status.mockRestore();}
  });
  it("retains locally but does not send or transfer to an account that differs from the post owner",async()=>{
    m.session.mockResolvedValue({uid:"b",token:"token-b"});
    await act(async()=>{await api.addPost(post);});
    expect(m.putStrict).toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(m.queue).not.toHaveBeenCalled();
    expect(JSON.stringify(client.getQueryData(["posts","foryou",null]))).not.toContain("synthetic");
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
  it("preserves an image post for review without sending unverified media",async()=>{
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    const withImage={...post,mediaUrls:["data:image/png;base64,c3ludGhldGlj"]};
    await act(async()=>{await api.addPost(withImage);});
    expect(m.putStrict).toHaveBeenCalledWith("posts",withImage);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.queue).toHaveBeenCalledWith("create_post",{postId:"p"},"a");
    expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({title:"Post not published"}));
  });
  it("does not silently omit unsupported note attachments",async()=>{
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    const note={...post,postType:"note" as const,noteAttachments:[{type:"text" as const,data:"synthetic"}]};
    await act(async()=>{await api.addPost(note);});
    expect(m.putStrict).toHaveBeenCalledWith("posts",note);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.queue).toHaveBeenCalledWith("create_post",{postId:"p"},"a");
  });
  it("retains a structured Room deposit without dropping fields on cloud send",async()=>{
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    const deposit={...post,depositType:"procedure" as const,depositFields:{steps:"synthetic steps"}};
    await act(async()=>{await api.addPost(deposit);});
    expect(m.putStrict).toHaveBeenCalledWith("posts",deposit);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.queue).toHaveBeenCalledWith("create_post",{postId:"p"},"a");
  });
  it.each([
    { title:"synthetic title" },
    { postType:"question" as const, questionDetails:"synthetic details" },
    { postType:"answer" as const, answeredPostId:"question" },
    { communityId:"room" },
    { roomId:"room" },
    { editPolicy:"public" as const },
    { event:{title:"event",startsAt:1,communityId:"room"} },
  ])("does not publish a partial or potentially mis-scoped post: %o",async(fields)=>{
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    const full={...post,...fields};
    await act(async()=>{await api.addPost(full);});
    expect(m.putStrict).toHaveBeenCalledWith("posts",full);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.queue).toHaveBeenCalledWith("create_post",{postId:"p"},"a");
  });
  it("sends only when both checks match the post owner",async()=>{
    m.session.mockResolvedValue({uid:"a",token:"token-a"});
    await act(async()=>{await api.addPost(post);});
    expect(m.create).toHaveBeenCalledWith({id:"p"},"token-a");
  });
});
