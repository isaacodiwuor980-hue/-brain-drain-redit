import { useEffect, useState } from "react";
import { getBrain, listBrains, type BrainDetailResponse, type CloudBrain } from "@/lib/api/brains";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 30;
type Result<T> = { key: string; value: T | null };
/** Public-only, server-backed view. It never reads device-local brain caches. */
export function PublicBrainLibrary() {
  const [page, setPage] = useState(0);
  const [list, setList] = useState<Result<{items: CloudBrain[]; hasMore: boolean}> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Result<BrainDetailResponse> | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [network, setNetwork] = useState(() => ({ online: typeof navigator === "undefined" || navigator.onLine !== false, generation: 0 }));
  const listKey = `${page}:${refresh}:${network.generation}`;
  const detailKey = `${selected}:${network.generation}`;
  const visibleList = list?.key === listKey ? list.value : undefined;
  const visibleDetail = detail?.key === detailKey ? detail.value : undefined;

  useEffect(() => {
    const online = () => setNetwork(n => ({online:true,generation:n.generation+1}));
    const offline = () => setNetwork(n => ({online:false,generation:n.generation+1}));
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);
  useEffect(() => {
    if (!network.online) return;
    const controller = new AbortController();
    let active = true;
    void listBrains({ mine: false, limit: PAGE_SIZE, offset: page * PAGE_SIZE, signal: controller.signal })
      .then(result => {
        if (!active) return;
        if (result.source === "degraded" || !Array.isArray(result.brains) ||
            result.brains.some(brain => brain.isPublic !== true) || typeof result.hasMore !== "boolean") throw new Error("Unverified public library");
        setList({key:listKey,value:{items:result.brains,hasMore:result.hasMore}});
      }).catch(() => { if (active) setList({key:listKey,value:null}); });
    return () => { active = false; controller.abort(); };
  }, [page, listKey, network.online]);

  useEffect(() => {
    if (!selected || !network.online) return;
    const controller = new AbortController();
    let active = true;
    void getBrain(selected, controller.signal).then(result => {
      if (!active) return;
      if (!result?.brain || result.brain.id !== selected || result.brain.isPublic !== true || !Array.isArray(result.nodes)) throw new Error("Unverified public brain");
      setDetail({key:detailKey,value:result});
    }).catch(() => { if (active) setDetail({key:detailKey,value:null}); });
    return () => { active = false; controller.abort(); };
  }, [selected, detailKey, network.online]);

  return <div className="container mx-auto p-6 space-y-6">
    <header className="space-y-2"><h1 className="text-2xl font-bold">Public brain library</h1>
      <p className="text-muted-foreground">Browse brains shared publicly. Your device-only and private brains are not shown here.</p></header>
    <p role="status" className="text-sm text-muted-foreground">Private and device-only library views remain paused; existing work is retained on this device.</p>
    {!network.online ? <p role="status">Connect to view public brains.</p> : <>
      {visibleList === undefined && <p role="status">Loading public brains…</p>}
      {visibleList === null && <div role="alert"><p>Public brains are unavailable right now.</p><Button variant="outline" onClick={() => setRefresh(n => n + 1)}>Try again</Button></div>}
      {visibleList && <>
        {visibleList.items.length === 0 ? <p>No public brains found on this page.</p> : <ul className="grid gap-3 md:grid-cols-2">
          {visibleList.items.map(brain => <li key={brain.id} className="rounded-xl border bg-card p-4 space-y-2">
            <h2 className="font-semibold">{brain.title}</h2><p className="text-sm text-muted-foreground">{brain.description}</p>
            <Button variant="outline" onClick={() => { setDetail(null); setSelected(brain.id); }}>View public brain</Button>
          </li>)}
        </ul>}
        <div className="flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => { setSelected(null); setPage(p => p - 1); }}>Previous</Button>
          <Button variant="outline" disabled={!visibleList.hasMore} onClick={() => { setSelected(null); setPage(p => p + 1); }}>Next</Button></div>
      </>}
      {selected && <section aria-label="Public brain details" className="rounded-xl border bg-card p-4 space-y-3">
        <Button variant="ghost" onClick={() => { setSelected(null); setDetail(null); }}>Close details</Button>
        {visibleDetail === undefined && <p role="status">Loading brain…</p>}
        {visibleDetail === null && <p role="alert">This brain is no longer available or could not be loaded.</p>}
        {visibleDetail && <><h2 className="text-xl font-semibold">{visibleDetail.brain.title}</h2>
          <p>{visibleDetail.brain.description}</p><ul className="space-y-2">{visibleDetail.nodes.map(node => <li key={node.id} className="rounded border p-3">
            {node.question_text && <p>{node.question_text}</p>}{node.result_text && <p>{node.result_text}</p>}{node.next_steps && <p>{node.next_steps}</p>}
          </li>)}</ul></>}
      </section>}
    </>}
  </div>;
}
