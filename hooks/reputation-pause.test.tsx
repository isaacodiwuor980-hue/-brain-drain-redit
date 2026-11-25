/** @vitest-environment happy-dom */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ get: vi.fn(), getAll: vi.fn(), put: vi.fn() }));
vi.mock("../lib/db", () => ({ idb: db }));
import { useReputation } from "./use-reputation";
describe("points and streak pause", () => {
  it("preserves existing points and stale streaks without initializing or awarding", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    db.get.mockResolvedValue({ id:"me",xp:100,level:1,streak:8,lastActiveDate:"2000-01-01",totalMissionsCompleted:0,totalBrainsCreated:0,totalCheckIns:0,badges:[] });
    db.getAll.mockResolvedValue([]); db.put.mockResolvedValue(undefined);
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    const el=document.createElement("div");document.body.append(el);const root=createRoot(el);let api!:ReturnType<typeof useReputation>;
    function Probe(){const value=useReputation();useEffect(()=>{api=value;});return null;}
    try {
      await act(async()=>{root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);});
      await act(async()=>{await vi.waitFor(()=>expect(api.reputation?.streak).toBe(8));});
      await expect(api.addXPEvent("mission_completed",100,"synthetic")).rejects.toThrow("Points temporarily unavailable");
      await expect(api.updateStreak()).rejects.toThrow("Streak changes temporarily unavailable");
      expect(db.put).not.toHaveBeenCalled();
    } finally {await act(async()=>root.unmount());client.clear();el.remove();vi.clearAllMocks();}
  });
});
