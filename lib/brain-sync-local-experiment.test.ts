import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {acknowledgeLocalSyncWrite,openBrainSyncExperiment,readLocalSyncDocument,saveLocalSyncEdit,stageLocalSyncWrite} from './brain-sync-local-experiment';
let db:IDBDatabase,second:IDBDatabase;
const op='10000000-0000-4000-8000-000000000001';
beforeEach(async()=>{vi.stubGlobal('indexedDB',new IDBFactory());db=await openBrainSyncExperiment();second=await openBrainSyncExperiment();});
afterEach(()=>{db.close();second.close();vi.unstubAllGlobals();});
describe('isolated experimental account-bound local journal',()=>{
  it('keeps the exact pending payload while later edits continue and survive acknowledgement',async()=>{
    await saveLocalSyncEdit(db,'alice','b',{id:'b',title:'first'});
    await stageLocalSyncWrite(db,'alice','b',op);
    await saveLocalSyncEdit(second,'alice','b',{id:'b',title:'later'});
    const before=await readLocalSyncDocument(db,'alice','b');
    expect(before?.pendingSnapshot).toEqual({id:'b',title:'first'});
    expect(before?.snapshot).toEqual({id:'b',title:'later'});
    const after=await acknowledgeLocalSyncWrite(db,'alice','b','alice',op,{kind:'ok',revision:1});
    expect(after.sync).toMatchObject({confirmedRevision:1,localGeneration:2,status:'dirty',pending:null});
    expect(after.snapshot).toEqual({id:'b',title:'later'});expect(after.pendingSnapshot).toBeNull();
  });
  it('does not transfer work to a switched account or mark uncertain writes as confirmed',async()=>{
    await saveLocalSyncEdit(db,'alice','b',{id:'b',title:'a'});await stageLocalSyncWrite(db,'alice','b',op);
    await expect(acknowledgeLocalSyncWrite(db,'alice','b','bob',op,{kind:'ok',revision:1})).rejects.toThrow();
    await saveLocalSyncEdit(second,'bob','b',{id:'b',title:'b'});
    const uncertain=await acknowledgeLocalSyncWrite(db,'alice','b','alice',op,{kind:'uncertain'});
    expect(uncertain.sync.status).toBe('pending');expect(uncertain.pendingSnapshot).toEqual({id:'b',title:'a'});
    expect((await readLocalSyncDocument(db,'bob','b'))?.snapshot).toEqual({id:'b',title:'b'});
  });
  it('keeps conflicted operations for review across reopen',async()=>{
    await saveLocalSyncEdit(db,'alice','b',{id:'b',title:'held'});await stageLocalSyncWrite(db,'alice','b',op);
    await acknowledgeLocalSyncWrite(db,'alice','b','alice',op,{kind:'conflict'});
    db.close(); db=await openBrainSyncExperiment();
    const saved=await readLocalSyncDocument(db,'alice','b');
    expect(saved?.sync.status).toBe('conflict');expect(saved?.pendingSnapshot).toEqual({id:'b',title:'held'});
    await expect(stageLocalSyncWrite(db,'alice','b','10000000-0000-4000-8000-000000000002')).rejects.toThrow();
  });
  it('serializes competing stage attempts without discarding the first operation',async()=>{
    await saveLocalSyncEdit(db,'alice','b',{id:'b'});
    const results=await Promise.allSettled([stageLocalSyncWrite(db,'alice','b',op),stageLocalSyncWrite(second,'alice','b','10000000-0000-4000-8000-000000000002')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect((await readLocalSyncDocument(db,'alice','b'))?.sync.pending).not.toBeNull();
  });
  it('rejects invalid snapshots and preserves stored edits on failed clones',async()=>{
    await saveLocalSyncEdit(db,'alice','b',{id:'b',title:'kept'});
    await expect(saveLocalSyncEdit(db,'alice','b',{id:'other'})).rejects.toThrow();
    await expect(saveLocalSyncEdit(db,'alice','b',{id:'b',bad:()=>{}})).rejects.toThrow();
    expect((await readLocalSyncDocument(db,'alice','b'))?.snapshot).toEqual({id:'b',title:'kept'});
  });
});
