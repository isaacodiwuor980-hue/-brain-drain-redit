/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ useDatabase: vi.fn(), list:vi.fn(), detail:vi.fn() }));
vi.mock("@/hooks/use-database", () => ({ useDatabase: m.useDatabase }));
vi.mock("@/components/Dashboard", () => ({ Dashboard: () => <div>synthetic private brain</div> }));
vi.mock("@/lib/api/brains", () => ({ listBrains:m.list, getBrain:m.detail }));
import { LibraryPage } from "./LibraryPage";
const pub={id:'public',title:'Public example',description:'Visible',isPublic:true,created_at:0,category:'',root_node_id:null};
beforeEach(()=>{vi.clearAllMocks();m.list.mockResolvedValue({brains:[pub],hasMore:false,source:'supabase'});m.detail.mockResolvedValue({brain:pub,nodes:[{id:'n',brain_id:'public',node_type:'outcome',result_text:'Public outcome'}]});});
async function renderPage() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
  await act(async()=>root.render(<LibraryPage/>));return {el,root};
}
describe("server-backed public library", () => {
  it("shows verified public entries but never mounts the unverified local views", async () => {
    m.useDatabase.mockReturnValue({ brains: [{ id: "b", title: "synthetic private brain" }] });
    const {el,root}=await renderPage();try {
      await vi.waitFor(()=>expect(el.textContent).toContain('Public example'));
      expect(el.textContent).not.toContain("synthetic private brain");expect(m.useDatabase).not.toHaveBeenCalled();
      const view=Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='View public brain')!;
      await act(async()=>view.click());await vi.waitFor(()=>expect(el.textContent).toContain('Public outcome'));
      expect(m.detail).toHaveBeenCalledWith('public',expect.any(AbortSignal));
    } finally {await act(async()=>root.unmount());el.remove();}
  });
  it("fails closed if a private record is returned in the public list",async()=>{
    m.list.mockResolvedValue({brains:[{...pub,isPublic:false,title:'private content'}],hasMore:false,source:'supabase'});
    const {el,root}=await renderPage();try{await vi.waitFor(()=>expect(el.textContent).toContain('unavailable'));expect(el.textContent).not.toContain('private content');}finally{await act(async()=>root.unmount());el.remove();}
  });
  it("does not display a brain that became private before detail retrieval",async()=>{
    m.detail.mockResolvedValue({brain:{...pub,isPublic:false,title:'secret'},nodes:[{id:'n',result_text:'secret node'}]});
    const {el,root}=await renderPage();try{await vi.waitFor(()=>expect(el.textContent).toContain('Public example'));const view=Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='View public brain')!;await act(async()=>view.click());await vi.waitFor(()=>expect(el.textContent).toContain('no longer available'));expect(el.textContent).not.toContain('secret');}finally{await act(async()=>root.unmount());el.remove();}
  });
  it("reports unavailable service instead of a false empty library",async()=>{
    m.list.mockResolvedValue({brains:[],hasMore:false,source:'degraded'});
    const {el,root}=await renderPage();try{await vi.waitFor(()=>expect(el.textContent).toContain('Public brains are unavailable'));}finally{await act(async()=>root.unmount());el.remove();}
  });
  it("hides public results offline and revalidates after reconnect",async()=>{
    const {el,root}=await renderPage();try{
      await vi.waitFor(()=>expect(el.textContent).toContain('Public example'));
      await act(async()=>window.dispatchEvent(new Event('offline')));
      expect(el.textContent).not.toContain('Public example');expect(el.textContent).toContain('Connect to view');
      m.list.mockResolvedValueOnce({brains:[],hasMore:false,source:'supabase'});
      await act(async()=>window.dispatchEvent(new Event('online')));
      await vi.waitFor(()=>expect(el.textContent).toContain('No public brains found'));
      expect(m.list).toHaveBeenCalledTimes(2);
    }finally{await act(async()=>root.unmount());el.remove();}
  });
  it("does not reuse old detail when the same item is reopened",async()=>{
    const {el,root}=await renderPage();try{
      await vi.waitFor(()=>expect(el.textContent).toContain('Public example'));
      const view=()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='View public brain')!;
      await act(async()=>view().click());await vi.waitFor(()=>expect(el.textContent).toContain('Public outcome'));
      await act(async()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Close details')!.click());
      m.detail.mockImplementationOnce(()=>new Promise(()=>{}));await act(async()=>view().click());
      expect(el.textContent).not.toContain('Public outcome');expect(el.textContent).toContain('Loading brain');
    }finally{await act(async()=>root.unmount());el.remove();}
  });

});
