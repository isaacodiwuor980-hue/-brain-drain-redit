/** @vitest-environment happy-dom */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getAll: vi.fn().mockResolvedValue([{id:"synthetic"}]), get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/db", () => ({ idb: m }));
import { useCommunities } from "./use-communities";
it("rejects local self-authorization and charter writes before storage", async () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element); let api!: ReturnType<typeof useCommunities>;
  function Probe(){const result=useCommunities(); useEffect(()=>{api=result;}); return null;}
  await act(async()=>root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>));
  m.get.mockClear(); m.put.mockClear();
  await act(async()=>{
    await expect(api.transferStewardship("synthetic")).rejects.toThrow(/paused/i);
    await expect(api.updateCharter({communityId:"synthetic",mission:"m",scope:"s"})).rejects.toThrow(/paused/i);
  });
  expect(m.get).not.toHaveBeenCalled(); expect(m.put).not.toHaveBeenCalled();
  await act(async()=>root.unmount()); client.clear(); element.remove();
});
afterEach(()=>vi.clearAllMocks());
