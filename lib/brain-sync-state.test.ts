import { describe, expect, it } from "vitest";
import { applyBrainSaveResult, maySendPending, type BrainSyncState } from "./brain-sync-state";
const state: BrainSyncState = {ownerId:'alice',brainId:'b',localGeneration:4,confirmedRevision:1,status:'pending',pending:{ownerId:'alice',brainId:'b',operationId:'op',expectedRevision:1,editGeneration:4}};
describe('account-bound brain sync transitions',()=>{
  it('confirms only the exact persisted generation',()=>{
    expect(applyBrainSaveResult(state,'alice','op',{kind:'ok',revision:2})).toMatchObject({confirmedRevision:2,status:'synced',pending:null});
    expect(applyBrainSaveResult({...state,localGeneration:5},'alice','op',{kind:'ok',revision:2})).toMatchObject({confirmedRevision:2,status:'dirty',pending:null,localGeneration:5});
  });
  it('holds pending work when account or operation changes',()=>{
    expect(maySendPending(state,'bob')).toBe(false); expect(maySendPending(state,null)).toBe(false);
    expect(applyBrainSaveResult(state,'bob','op',{kind:'ok',revision:2})).toBe(state);
    expect(applyBrainSaveResult(state,'alice','other',{kind:'ok',revision:2})).toBe(state);
    expect(maySendPending({...state,pending:{...state.pending!,brainId:'other'}},'alice')).toBe(false);
  });
  it('holds inconsistent or malformed persisted state',()=>{
    expect(maySendPending({...state,confirmedRevision:0},'alice')).toBe(false);
    expect(maySendPending({...state,localGeneration:3},'alice')).toBe(false);
    expect(maySendPending({...state,pending:{...state.pending!,operationId:''}},'alice')).toBe(false);
  });
  it('preserves uncertain writes and marks conflicts without throwing away the payload',()=>{
    expect(applyBrainSaveResult(state,'alice','op',{kind:'uncertain'})).toBe(state);
    const conflict=applyBrainSaveResult(state,'alice','op',{kind:'conflict'});
    expect(conflict.status).toBe('conflict');expect(conflict.pending).toEqual(state.pending);
    expect(maySendPending(conflict,'alice')).toBe(false);
  });
  it('does not accept invalid or unexpected acknowledgement versions',()=>{
    for(const revision of [0,1,3,NaN,Infinity,1.5]) expect(applyBrainSaveResult(state,'alice','op',{kind:'ok',revision})).toBe(state);
  });
});
