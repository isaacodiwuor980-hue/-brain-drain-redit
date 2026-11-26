import {afterEach,describe,expect,it,vi} from "vitest";
import {quarantineActions,quarantineOutcome,type QueuedAction} from "./offline-sync";
const action=(i:number):QueuedAction=>({id:`item-${i}`,type:"create_post",payload:{postId:`post-${i}`},ownerId:"synthetic-user",createdAt:1,retryCount:5});
function storage(initial:string|null=null){
  let value=initial;
  return {getItem:vi.fn(()=>value),setItem:vi.fn((_key:string,next:string)=>{value=next;}),value:()=>value};
}
afterEach(()=>vi.unstubAllGlobals());
describe("offline recovery quarantine",()=>{
  it("keeps a failed quarantine item in the pending queue without automatic retry",()=>{
    const held=quarantineOutcome([action(1)],false);
    expect(held.deadIds).toEqual([]);expect(held.held).toEqual([{...action(1),nextAttemptAt:Number.MAX_SAFE_INTEGER}]);
    expect(quarantineOutcome([action(1)],true)).toEqual({deadIds:["item-1"],held:[]});
  });
  it("reports success only after writing the full quarantine list",()=>{
    const local=storage();vi.stubGlobal("localStorage",local);vi.stubGlobal("window",{dispatchEvent:vi.fn()});vi.stubGlobal("CustomEvent",class{});
    expect(quarantineActions([action(1)])).toBe(true);
    expect(JSON.parse(local.value()!)).toEqual([action(1)]);
  });
  it("does not discard older entries when the quarantine is full",()=>{
    const existing=JSON.stringify(Array.from({length:50},(_,i)=>action(i)));const local=storage(existing);
    vi.stubGlobal("localStorage",local);vi.stubGlobal("window",{dispatchEvent:vi.fn()});vi.stubGlobal("CustomEvent",class{});
    expect(quarantineActions([action(100)])).toBe(false);expect(local.value()).toBe(existing);expect(local.setItem).not.toHaveBeenCalled();
  });
  it("fails without overwriting malformed stored data or silently acknowledging quota errors",()=>{
    const local=storage("{broken");vi.stubGlobal("localStorage",local);
    expect(quarantineActions([action(1)])).toBe(false);expect(local.value()).toBe("{broken");
    const full=storage();full.setItem.mockImplementation(()=>{throw new Error("quota");});vi.stubGlobal("localStorage",full);
    expect(quarantineActions([action(1)])).toBe(false);
  });
});
