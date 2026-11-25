/** @vitest-environment happy-dom */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ get: vi.fn(), getAll: vi.fn(), put: vi.fn() }));
vi.mock("../lib/db", () => ({idb: db}));
import { useReputation } from "./use-reputation";
describe("vote bonus containment", () => {
  afterEach(() => vi.clearAllMocks());
  it("rejects vote bonus before any reputation or event write", async () => {
    (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
    db.get.mockResolvedValue({id:"me",xp:100,level:1,streak:1,lastActiveDate:new Date().toISOString().split("T")[0],totalMissionsCompleted:0,totalBrainsCreated:0,totalCheckIns:0,badges:[]});
    db.getAll.mockResolvedValue([]);
    const client = new QueryClient({defaultOptions:{mutations:{retry:false},queries:{retry:false}}});
    const el=document.createElement("div"); document.body.append(el); const root=createRoot(el);
    let hook!: ReturnType<typeof useReputation>;
    function Probe(){const value=useReputation(); useEffect(()=>{hook=value;}); return null;}
    await act(async()=>{root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);});
    db.put.mockClear();
    await expect(hook.addXPEvent("vote_bonus",5,"synthetic")).rejects.toThrow("Vote rewards unavailable");
    expect(db.put).not.toHaveBeenCalled();
    await act(async()=>{root.unmount();}); client.clear(); el.remove();
  });
});
