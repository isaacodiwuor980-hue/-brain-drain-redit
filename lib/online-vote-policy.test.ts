import {describe,expect,it} from "vitest";
import {mayStartVote} from "./online-vote-policy";
describe("online-first vote policy",()=>{
  it("blocks votes when the tracked or current browser status is offline",()=>{
    expect(mayStartVote("offline",true)).toBe(false);
    expect(mayStartVote("online",false)).toBe(false);
    expect(mayStartVote("offline",false)).toBe(false);
  });
  it("allows attempting a vote online but does not claim the server is reachable",()=>{
    expect(mayStartVote("online",true)).toBe(true);
  });
});
