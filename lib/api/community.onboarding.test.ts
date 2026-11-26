import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({get:vi.fn(),post:vi.fn(),request:vi.fn(),token:vi.fn()}));
vi.mock("@/lib/api-client",()=>({api:{get:mock.get,post:mock.post,request:mock.request}}));
vi.mock("@/lib/auth-token",()=>({getAuthToken:mock.token}));
import { onboardingApi } from "./community";
beforeEach(()=>{vi.clearAllMocks();mock.token.mockResolvedValue("synthetic-token");mock.get.mockResolvedValue({currentStep:"profile"});});
it("requests private onboarding state with the current token and no-store",async()=>{
  await onboardingApi.get();
  expect(mock.get).toHaveBeenCalledWith("/api/onboarding",{cache:"no-store",headers:{Authorization:"Bearer synthetic-token"}});
});
