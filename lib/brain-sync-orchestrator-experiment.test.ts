import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {openBrainSyncExperiment,readLocalSyncDocument,saveLocalSyncEdit,stageLocalSyncWrite} from './brain-sync-local-experiment';
import {sendPendingBrainExperiment} from './brain-sync-orchestrator-experiment';
let db:IDBDatabase;const op='10000000-0000-4000-8000-000000000001';
const alice={uid:'alice',token:'token-a'},bob={uid:'bob',token:'token-b'};
beforeEach(async()=>{vi.stubGlobal('indexedDB',new IDBFactory());db=await openBrainSyncExperiment();await saveLocalSyncEdit(db,'alice','brain',{id:'brain',title:'original'});await stageLocalSyncWrite(db,'alice','brain',op);});
afterEach(()=>{db.close();vi.unstubAllGlobals();});
describe('unwired experimental synchronization attempt',()=>{
  it('sends the original stored payload and acknowledges without deleting later edits',async()=>{
    const session=vi.fn().mockResolvedValue(alice);
    const send=vi.fn(async()=>{await saveLocalSyncEdit(db,'alice','brain',{id:'brain',title:'newer'});return {kind:'ok' as const,revision:1};});
    expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('acknowledged');
    expect(send).toHaveBeenCalledWith({brainId:'brain',operationId:op,expectedRevision:0,snapshot:{id:'brain',title:'original'}},'token-a');
    const doc=await readLocalSyncDocument(db,'alice','brain');expect(doc?.snapshot.title).toBe('newer');expect(doc?.sync.status).toBe('dirty');
  });
  it('never sends under a different account before the request',async()=>{
    const session=vi.fn().mockResolvedValueOnce(alice).mockResolvedValueOnce(bob);const send=vi.fn();
    expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('not-sent');expect(send).not.toHaveBeenCalled();
    expect((await readLocalSyncDocument(db,'alice','brain'))?.sync.status).toBe('pending');
  });
  it('retains a pending payload if the session switches after sending',async()=>{
    const session=vi.fn().mockResolvedValueOnce(alice).mockResolvedValueOnce(alice).mockResolvedValueOnce(bob);
    expect(await sendPendingBrainExperiment(db,'alice','brain',session,async()=>({kind:'ok',revision:1}))).toBe('session-changed');
    expect((await readLocalSyncDocument(db,'alice','brain'))?.pendingSnapshot).toEqual({id:'brain',title:'original'});
  });
  it('holds uncertain or invalid acknowledgements and does not retry automatically',async()=>{
    const send=vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({kind:'ok',revision:9});
    const session=vi.fn().mockResolvedValue(alice);
    expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('unconfirmed');expect(send).toHaveBeenCalledTimes(1);
    expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('unconfirmed');
    expect((await readLocalSyncDocument(db,'alice','brain'))?.sync.status).toBe('pending');
  });
  it('retains a conflict for review and does not resend it',async()=>{
    const session=vi.fn().mockResolvedValue(alice),send=vi.fn().mockResolvedValue({kind:'conflict'});
    expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('conflict');
    expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('not-sent');expect(send).toHaveBeenCalledTimes(1);
    expect((await readLocalSyncDocument(db,'alice','brain'))?.pendingSnapshot).toEqual({id:'brain',title:'original'});
  });
});
