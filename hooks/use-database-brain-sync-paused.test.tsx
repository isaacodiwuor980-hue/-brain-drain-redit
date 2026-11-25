/** @vitest-environment happy-dom */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrainData } from "../lib/types";
const m=vi.hoisted(()=>({getAll:vi.fn(),save:vi.fn(),saveCloud:vi.fn(),toast:vi.fn()}));
vi.mock("@/lib/db",()=>({idb:{getAll:m.getAll,saveBrainWithNodes:m.save}}));
vi.mock("@/lib/auth-token",()=>({getAuthToken:vi.fn().mockResolvedValue("different-account-token")}));
vi.mock("@/lib/api/brains",()=>({listBrains:vi.fn().mockResolvedValue({brains:[]}),saveBrain:m.saveCloud,isBrainsError:()=>false}));
vi.mock("@/lib/analytics",()=>({getAnalyticsEvents:vi.fn().mockResolvedValue([])}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:m.toast})}));
import { useDatabase } from "./use-database";
let api:ReturnType<typeof useDatabase>,client:QueryClient,root:ReturnType<typeof createRoot>,el:HTMLDivElement;
function Probe(){const value=useDatabase();useEffect(()=>{api=value;});return null;}
const data={brain:{id:"synthetic",title:"example",category:"test",description:"",created_at:1,root_node_id:null},nodes:[]} as BrainData;
beforeEach(async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.clearAllMocks();m.getAll.mockResolvedValue([data.brain]);m.save.mockResolvedValue(undefined);
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});el=document.createElement("div");document.body.append(el);root=createRoot(el);
  await act(async()=>root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>));
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();el.remove();});
describe("brain automatic cloud save containment",()=>{
  it("keeps local edits without sending under whichever account is current",async()=>{
    await act(async()=>{await api.saveBrainData(data);});
    expect(m.save).toHaveBeenCalledWith(data.brain,data.nodes);expect(m.saveCloud).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({title:"Saved on this device"}));
  });
  it("fails before cloud sending if local storage fails",async()=>{
    m.save.mockRejectedValueOnce(new Error("quota"));
    await act(async()=>{await expect(api.saveBrainData(data)).rejects.toThrow("quota");});
    expect(m.saveCloud).not.toHaveBeenCalled();
  });
});
