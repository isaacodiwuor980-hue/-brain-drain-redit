import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {openBrainSyncExperiment,readLocalSyncDocument,saveLocalSyncEdit,stageLocalSyncWrite} from './brain-sync-local-experiment';
import {sendPendingBrainExperiment} from './brain-sync-orchestrator-experiment';
let db:IDBDatabase;const op='10000000-0000-4000-8000-000000000001';
const alice={uid:'alice',token:'token-a',sessionGeneration:1},bob={uid:'bob',token:'token-b',sessionGeneration:1};
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

it('does not send across a same-account sign-out and sign-in',async()=>{
  const session=vi.fn().mockResolvedValueOnce({...alice,sessionGeneration:1}).mockResolvedValueOnce({...alice,sessionGeneration:2});
  const send=vi.fn();
  expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('session-changed');
  expect(send).not.toHaveBeenCalled();
  expect((await readLocalSyncDocument(db,'alice','brain'))?.sync.status).toBe('pending');
});
it('retains the pending operation if same-account session changes during the request',async()=>{
  const session=vi.fn().mockResolvedValueOnce({...alice,sessionGeneration:1}).mockResolvedValueOnce({...alice,sessionGeneration:1}).mockResolvedValueOnce({...alice,sessionGeneration:2});
  expect(await sendPendingBrainExperiment(db,'alice','brain',session,async()=>({kind:'ok',revision:1}))).toBe('session-changed');
  expect((await readLocalSyncDocument(db,'alice','brain'))?.sync.status).toBe('pending');
});
it('does not send without a valid session generation',async()=>{
  const session=vi.fn().mockResolvedValue({...alice,sessionGeneration:NaN}); const send=vi.fn();
  expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('not-sent');expect(send).not.toHaveBeenCalled();
});
it('allows token refresh in the same session without changing the pending payload',async()=>{
  const session=vi.fn().mockResolvedValueOnce(alice).mockResolvedValueOnce({...alice,token:'refreshed'}).mockResolvedValueOnce({...alice,token:'refreshed'});
  const send=vi.fn().mockResolvedValue({kind:'ok',revision:1});
  expect(await sendPendingBrainExperiment(db,'alice','brain',session,send)).toBe('acknowledged');
  expect(send).toHaveBeenCalledWith(expect.objectContaining({operationId:op}), 'refreshed');
});
it('keeps the pending operation if the transport returns a malformed result',async()=>{
  const session=vi.fn().mockResolvedValue(alice);
  expect(await sendPendingBrainExperiment(db,'alice','brain',session,async()=>null as never)).toBe('unconfirmed');
  expect((await readLocalSyncDocument(db,'alice','brain'))?.sync.status).toBe('pending');
});
