// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
vi.mock("./env",()=>({env:{isProd:true,apiBaseUrl:""}}));
import { reportError } from "./error-monitor";
describe("client error privacy containment",()=>{
  it("does not send unreviewed error content to the backend",()=>{
    const beacon=vi.fn();vi.stubGlobal("navigator",{sendBeacon:beacon});
    try {reportError({message:"synthetic-voter",stack:"synthetic-vote"});expect(beacon).not.toHaveBeenCalled();}
    finally {vi.unstubAllGlobals();}
  });
});
