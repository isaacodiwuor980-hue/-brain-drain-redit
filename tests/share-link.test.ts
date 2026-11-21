import { describe, expect, it } from "vitest";
import {
  buildShareUrl,
  decodeShareHash,
  encodeSharePayload,
  isValidPayload,
  fromBase64Url,
  toBase64Url,
  SHARE_URL_WARN_LENGTH,
} from "../lib/share-link";
import type { Brain, Node } from "../lib/types";

const brain: Brain = {
  id: "brain-1",
  title: "Laptop buying guide ☕", // non-ASCII on purpose
  description: "Should I buy a Mac or a PC? 日本語 also",
  created_at: 1_700_000_000_000,
  root_node_id: "n1",
  repo_status: "private",
} as Brain;

const nodes: Node[] = [
  { id: "n1", brain_id: "brain-1", node_type: "question", content: "Is your budget under $800?", if_true_node_id: "n2", if_false_node_id: "n3" },
  { id: "n2", brain_id: "brain-1", node_type: "outcome", content: "Get a budget Windows laptop" },
  { id: "n3", brain_id: "brain-1", node_type: "question", content: "Do you prefer macOS?", if_true_node_id: "n4", if_false_node_id: "n4" },
  { id: "n4", brain_id: "brain-1", node_type: "outcome", content: "Buy a MacBook Air 🍎" },
] as Node[];

describe("share-link encoding", () => {
  it("round-trips a brain with unicode content", () => {
    const encoded = encodeSharePayload({ brain, nodes });
    const decoded = decodeShareHash(`#share=${encoded}`);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.payload.brain.title).toBe(brain.title);
    expect(decoded.payload.brain.description).toBe(brain.description);
    expect(decoded.payload.nodes).toHaveLength(nodes.length);
    expect(decoded.payload.nodes[3].content).toBe(nodes[3].content);
    expect(decoded.legacy).toBe(false);
  });

  it("produces URL-safe output (no +, /, = or %)", () => {
    const encoded = encodeSharePayload({ brain, nodes });
    expect(encoded).not.toMatch(/[+/=%]/);
    // Must survive a URL/hash without further escaping.
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it("is materially smaller than the legacy btoa(encodeURIComponent(json)) format", () => {
    const json = JSON.stringify({ brain, nodes });
    const legacy = btoa(encodeURIComponent(json));
    const current = encodeSharePayload({ brain, nodes });
    // The old double-encoding inflated unicode-heavy payloads dramatically.
    expect(current.length).toBeLessThan(legacy.length * 0.8);
  });

  it("still decodes legacy links already in the wild", () => {
    const legacy = btoa(encodeURIComponent(JSON.stringify({ brain, nodes })));
    const decoded = decodeShareHash(`#share=${legacy}`);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.legacy).toBe(true);
    expect(decoded.payload.nodes).toHaveLength(4);
  });

  it("returns no-hash when there is nothing to decode", () => {
    expect(decodeShareHash("")).toMatchObject({ ok: false, reason: "no-hash" });
    expect(decodeShareHash("#something=else")).toMatchObject({ ok: false, reason: "no-hash" });
  });

  it("fails soft on a truncated link instead of throwing", () => {
    const full = encodeSharePayload({ brain, nodes });
    const truncated = full.slice(0, Math.floor(full.length / 2));
    expect(() => decodeShareHash(`#share=${truncated}`)).not.toThrow();
    expect(decodeShareHash(`#share=${truncated}`).ok).toBe(false);
  });

  it("fails soft on garbage input", () => {
    expect(decodeShareHash("#share=!!!!not-base64!!!!").ok).toBe(false);
    expect(decodeShareHash("#share=%7B%7D").ok).toBe(false);
  });

  it("rejects structurally invalid payloads", () => {
    const noId = encodeSharePayload({ brain: { ...brain, id: "" }, nodes });
    expect(decodeShareHash(`#share=${noId}`).ok).toBe(false);
    expect(isValidPayload(null)).toBe(false);
    expect(isValidPayload({ brain, nodes: "nope" })).toBe(false);
    expect(isValidPayload({ brain: { title: "x" }, nodes: [] })).toBe(false);
    expect(isValidPayload({ brain: { id: "x" }, nodes: [] })).toBe(false);
    expect(isValidPayload({ brain, nodes: [null] })).toBe(false);
    expect(isValidPayload({ brain: { ...brain, category: {} }, nodes: [] })).toBe(false);
  });

  it("builds an absolute root-anchored URL", () => {
    const url = buildShareUrl("https://brain.example", "/settings", { brain, nodes });
    expect(url.startsWith("https://brain.example/#share=")).toBe(true);
    // The receiver must land on the app root, not on the sender's page.
    expect(url).not.toContain("/settings");
  });
});

describe("base64url primitives", () => {
  it("round-trips arbitrary bytes including high values", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 200, 255, 65, 66, 67]);
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it("handles every padding remainder", () => {
    for (const len of [1, 2, 3, 4, 5, 6, 7]) {
      const bytes = new Uint8Array(len).fill(65);
      expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toHaveLength(len);
    }
  });

  it("keeps realistic brains under the warn threshold", () => {
    const encoded = encodeSharePayload({ brain, nodes });
    expect(encoded.length).toBeLessThan(SHARE_URL_WARN_LENGTH);
  });
});
