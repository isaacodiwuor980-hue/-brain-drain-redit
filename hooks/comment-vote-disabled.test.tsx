/** @vitest-environment happy-dom */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), track: vi.fn() }));
vi.mock("@/lib/db", () => ({idb: mock}));
vi.mock("@/lib/analytics", () => ({trackEvent: mock.track}));
import { useComments } from "./use-comments";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement, client: QueryClient;
let api: ReturnType<typeof useComments>;
function Probe() { const value = useComments(); useEffect(() => { api = value; }); return null; }
beforeEach(async () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); mock.get.mockResolvedValue({id: "c", myVote: null, myHouseVote: false, myMouthVote: false}); mock.put.mockResolvedValue(undefined); mock.track.mockResolvedValue(undefined);
  client = new QueryClient({defaultOptions: {mutations: {retry: false}}}); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>));
});
afterEach(async () => {await act(async () => root.unmount()); client.clear(); container.remove();});
describe("unverified local comment voting", () => {
  it("rejects confidential comments before optimistic mutation or storage", async () => {
    await expect(api.addComment({postId:"p",parentId:null,content:"synthetic private",authorName:"Alice",isConfidential:true})).rejects.toThrow("Confidential replies are unavailable");
    expect(mock.get).not.toHaveBeenCalled(); expect(mock.put).not.toHaveBeenCalled(); expect(mock.track).not.toHaveBeenCalled();
  });
  it("rejects all vote actions before mutation, storage or analytics", async () => {
    await expect(api.voteComment({id:"c", postId:"p", direction:"up"})).rejects.toThrow("Voting temporarily unavailable");
    await expect(api.voteHouse({id:"c", postId:"p"})).rejects.toThrow("Voting temporarily unavailable");
    await expect(api.voteMouth({id:"c", postId:"p"})).rejects.toThrow("Voting temporarily unavailable");
    expect(mock.get).not.toHaveBeenCalled(); expect(mock.put).not.toHaveBeenCalled(); expect(mock.track).not.toHaveBeenCalled();
  });
});
