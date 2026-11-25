/** @vitest-environment happy-dom */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({getAll:vi.fn(),get:vi.fn(),put:vi.fn(),toast:vi.fn()}));
vi.mock("@/lib/db",()=>({idb:{getAll:m.getAll,get:m.get,put:m.put}}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:m.toast})}));
import { useSkills } from "./use-skills";
describe("unverified skill search during outage",()=>{
  it("refuses unverified approval before storage or network writes",async()=>{
    (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    m.getAll.mockResolvedValue([]); m.get.mockResolvedValue({id:"s",status:"in_review",title:"example"});
    const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    const el=document.createElement("div");document.body.append(el);const root=createRoot(el);let api!:ReturnType<typeof useSkills>;
    function Probe(){const value=useSkills();useEffect(()=>{api=value;});return null;}
    try {
      await act(async()=>{root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);});
      await act(async()=>{await expect(api.approveAndPublish({skillId:"s",reviewerId:"untrusted"})).rejects.toThrow("Skill publishing is temporarily unavailable");});
      expect(m.get).not.toHaveBeenCalled();expect(m.put).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
    } finally {await act(async()=>root.unmount());client.clear();el.remove();vi.unstubAllGlobals();vi.clearAllMocks();}
  });
  it("reports unavailable rather than returning stale cached public labels",async()=>{
    (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    m.getAll.mockResolvedValue([{id:"s",title:"example",domain:"test",status:"published",version:"v1"}]);
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:503}));
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    const el=document.createElement("div");document.body.append(el);const root=createRoot(el);let api!:ReturnType<typeof useSkills>;
    function Probe(){const value=useSkills();useEffect(()=>{api=value;});return null;}
    try {
      await act(async()=>{root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);});
      m.getAll.mockClear();
      await act(async()=>{await expect(api.searchPublic({query:"example"})).rejects.toThrow("Skill search is temporarily unavailable");});
      expect(m.getAll).not.toHaveBeenCalled();
    } finally {await act(async()=>root.unmount());client.clear();el.remove();vi.unstubAllGlobals();vi.clearAllMocks();}
  });
});
