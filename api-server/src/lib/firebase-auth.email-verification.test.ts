import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("./config", () => ({ config: { firebase: { projectId: "test-project" } } }));
import { verifyFirebaseToken } from "./firebase-auth";
let privateKey: CryptoKey;
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
async function token(emailVerified?: unknown, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "RS256", typ: "JWT", kid: "test-key" });
  const payload = encode({ iss: "https://securetoken.google.com/test-project", aud: "test-project", sub: "test-user", iat: now, exp: now + 60, email: "admin@example.test", ...(emailVerified === undefined ? {} : { email_verified: emailVerified }), ...overrides });
  const input = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(sig).toString("base64url")}`;
}
beforeAll(async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  privateKey = keys.privateKey;
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [{ ...jwk, kid: "test-key" }] }), { status: 200, headers: { "content-type": "application/json" } })));
});
afterAll(() => vi.unstubAllGlobals());
describe("signed Firebase email verification claim", () => {
  it("accepts only the boolean true verification claim", async () => {
    expect((await verifyFirebaseToken(await token(true))).emailVerified).toBe(true);
    expect((await verifyFirebaseToken(await token(false))).emailVerified).toBe(false);
    expect((await verifyFirebaseToken(await token())).emailVerified).toBe(false);
    expect((await verifyFirebaseToken(await token("true"))).emailVerified).toBe(false);
  });
  it("does not trust a tampered token", async () => {
    const parts = (await token(false)).split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()); payload.email_verified = true;
    await expect(verifyFirebaseToken(`${parts[0]}.${encode(payload)}.${parts[2]}`)).rejects.toThrow("Invalid token signature");
  });
});


describe("signed authentication time", () => {
  it("retains a signed valid auth_time for sensitive-action checks", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect((await verifyFirebaseToken(await token(true, { auth_time: now - 100 }))).authTime).toBe(now - 100);
  });
  it("does not accept missing, malformed or future authentication times as proof of freshness", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const auth_time of [undefined, null, "123", -1, 1.5, now + 60]) {
      expect((await verifyFirebaseToken(await token(true, { auth_time }))).authTime).toBeUndefined();
    }
  });
  it("rejects a modified auth_time with an invalid signature", async () => {
    const parts = (await token(true, { auth_time: 1 })).split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    payload.auth_time = Math.floor(Date.now() / 1000);
    await expect(verifyFirebaseToken(`${parts[0]}.${encode(payload)}.${parts[2]}`)).rejects.toThrow("Invalid token signature");
  });
});

describe("signed Firebase token required claims", () => {
  it.each([
    { exp: undefined }, { iat: undefined }, { exp: "9999999999" }, { iat: "1" },
    { exp: null }, { iat: null }, { exp: -1 }, { iat: 1.5 },
    { sub: "" }, { sub: "x".repeat(129) },
  ])("rejects invalid required claim %#", async (claims) => {
    await expect(verifyFirebaseToken(await token(true, claims))).rejects.toThrow();
  });
  it("rejects expired and future-issued tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyFirebaseToken(await token(true, { exp: now - 30 }))).rejects.toThrow("expired");
    await expect(verifyFirebaseToken(await token(true, { iat: now + 30 }))).rejects.toThrow("future");
  });
});
