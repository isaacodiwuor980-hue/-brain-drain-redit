import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ currentUser: null as null | {uid:string; getIdToken:(force?:boolean)=>Promise<string>} }));
vi.mock("./firebase-auth", () => ({auth: state}));
import { getAuthSession, getAuthToken } from "./auth-token";

describe("token acquisition during account changes", () => {
  beforeEach(() => { state.currentUser = null; });
  it.each([false, true])("does not return a previous account token after switch (force=%s)", async force => {
    let finish!: (value:string)=>void;
    const getIdToken=vi.fn(() => new Promise<string>(resolve => {finish=resolve;}));
    state.currentUser={uid:"a",getIdToken};
    const pending=getAuthToken(force);
    await vi.waitFor(() => expect(getIdToken).toHaveBeenCalled());
    state.currentUser={uid:"b",getIdToken:vi.fn().mockResolvedValue("token-b")};
    finish("token-a");
    await expect(pending).resolves.toBeNull();
    expect(getIdToken).toHaveBeenCalledWith(force);
  });
  it("rejects a session if the user signs out before token acquisition completes", async () => {
    let finish!: (value:string)=>void;
    const getIdToken=vi.fn(() => new Promise<string>(resolve=>{finish=resolve;}));
    state.currentUser={uid:"a",getIdToken};
    const pending=getAuthSession();
    await vi.waitFor(()=>expect(getIdToken).toHaveBeenCalled());
    state.currentUser=null; finish("token-a");
    await expect(pending).resolves.toBeNull();
  });
  it("returns the token only while the same Firebase user remains current", async () => {
    state.currentUser={uid:"a",getIdToken:vi.fn().mockResolvedValue("token-a")};
    await expect(getAuthToken()).resolves.toBe("token-a");
    await expect(getAuthSession()).resolves.toEqual({uid:"a",token:"token-a"});
  });
});
