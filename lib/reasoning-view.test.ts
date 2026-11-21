import { describe, expect, it } from "vitest";
import type { Brain, Node } from "./types";
import {
  buildWalkthrough,
  computeConfidence,
  layoutTree,
  resolveRootId,
  summarizeBrain,
} from "./reasoning-view";

const brain = (overrides: Partial<Brain> = {}): Brain => ({
  id: "b1",
  title: "Test brain",
  category: "",
  description: "",
  created_at: 1,
  root_node_id: "q1",
  ...overrides,
});

const q = (id: string, yes?: string | null, no?: string | null): Node => ({
  id,
  brain_id: "b1",
  node_type: "question",
  question_text: `Question ${id}?`,
  if_true_node_id: yes ?? null,
  if_false_node_id: no ?? null,
});

const o = (id: string): Node => ({
  id,
  brain_id: "b1",
  node_type: "outcome",
  result_text: `Outcome ${id}`,
  next_steps: "Do the thing.",
});

describe("resolveRootId", () => {
  it("prefers the declared root", () => {
    expect(resolveRootId(brain(), [q("q1"), q("q2")])).toBe("q1");
  });

  it("falls back to the first question when the root is dangling", () => {
    expect(resolveRootId(brain({ root_node_id: "gone" }), [o("o1"), q("q2")])).toBe("q2");
  });

  it("returns null for an empty brain", () => {
    expect(resolveRootId(brain({ root_node_id: null }), [])).toBeNull();
  });
});

describe("layoutTree", () => {
  const nodes = [q("q1", "q2", "o1"), q("q2", "o2", "o3"), o("o1"), o("o2"), o("o3")];

  it("lays out reachable nodes with stable depth", () => {
    const tree = layoutTree(brain(), nodes);
    const depths = Object.fromEntries(tree.nodes.map((n) => [n.node.id, n.depth]));
    expect(depths).toEqual({ q1: 0, q2: 1, o1: 1, o2: 2, o3: 2 });
    expect(tree.maxDepth).toBe(2);
    expect(tree.nodes.every((n) => !n.orphan)).toBe(true);
    // 2 branches from q1 + 2 from q2
    expect(tree.edges).toHaveLength(4);
  });

  it("never visits a node twice in a cyclic graph", () => {
    const cyclic = [q("q1", "q2", "q2"), q("q2", "q1", "q1")];
    const tree = layoutTree(brain(), cyclic);
    expect(tree.nodes).toHaveLength(2);
  });

  it("flags unreachable nodes as orphans instead of dropping them", () => {
    const tree = layoutTree(brain(), [...nodes, q("q9", "o9")]);
    const orphan = tree.nodes.find((n) => n.node.id === "q9");
    expect(orphan?.orphan).toBe(true);
  });

  it("is deterministic across calls", () => {
    expect(layoutTree(brain(), nodes)).toEqual(layoutTree(brain(), nodes));
  });
});

describe("computeConfidence", () => {
  it("scores a well-connected tree without claiming factual verification", () => {
    const nodes = [q("q1", "q2", "o1"), q("q2", "o2", "o3"), o("o1"), o("o2"), o("o3")];
    const c = computeConfidence(brain(), nodes);
    expect(c.score).toBe(100);
    expect(c.label).toBe("Well connected");
    expect(c.danglingBranches).toBe(0);
    expect(c.orphans).toBe(0);
  });

  it("penalises unwired branches", () => {
    const nodes = [q("q1", "o1", null), o("o1")];
    const c = computeConfidence(brain(), nodes);
    expect(c.danglingBranches).toBe(1);
    expect(c.score).toBeLessThan(90);
    expect(c.score).toBeGreaterThan(0);
  });

  it("reports an empty brain as incomplete", () => {
    const c = computeConfidence(brain({ root_node_id: null }), []);
    expect(c.score).toBe(0);
    expect(c.label).toBe("Incomplete");
  });

  it("never exceeds 100", () => {
    const nodes = [q("q1", "o1", "o2"), o("o1"), o("o2")];
    expect(computeConfidence(brain(), nodes).score).toBeLessThanOrEqual(100);
  });
});

describe("buildWalkthrough", () => {
  it("walks depth-first with the YES branch first", () => {
    const nodes = [q("q1", "q2", "o1"), q("q2", "o2", "o3"), o("o1"), o("o2"), o("o3")];
    const steps = buildWalkthrough(brain(), nodes);
    expect(steps.map((s) => s.node.id)).toEqual(["q1", "q2", "o2", "o3", "o1"]);
    expect(steps[0].branches.map((b) => b.decision)).toEqual([true, false]);
  });

  it("marks a question with a missing branch as incomplete", () => {
    const steps = buildWalkthrough(brain(), [q("q1", "o1", null), o("o1")]);
    expect(steps[0].incomplete).toBe(true);
  });

  it("returns nothing when there is no root", () => {
    expect(buildWalkthrough(brain({ root_node_id: null }), [])).toEqual([]);
  });

  it("terminates on cycles", () => {
    const steps = buildWalkthrough(brain(), [q("q1", "q2", "q2"), q("q2", "q1", "q1")]);
    expect(steps).toHaveLength(2);
  });
});

describe("summarizeBrain", () => {
  it("builds a one-line headline with the confidence mix", () => {
    const { headline, confidence } = summarizeBrain(brain(), [q("q1", "o1", "o1"), o("o1")]);
    expect(headline).toContain("1 question");
    expect(headline).toContain("1 outcome");
    expect(headline).toContain(`structure ${confidence.score}/100`);
  });
});
