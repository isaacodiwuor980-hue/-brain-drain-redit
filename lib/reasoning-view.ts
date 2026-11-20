import type { Brain, Node } from "./types";

/**
 * Pure helpers that turn a decision brain's node soup into the three
 * presentations the UI toggles between:
 *
 *   1. "tree"       — a deterministic, layered visual reasoning tree
 *                     (no d3, no randomness → identical layout every render
 *                     and on every device, which is what makes it testable).
 *   2. "walkthrough"— an ordered, scrollable list of every reachable question
 *                     and its YES/NO branch, i.e. the flat-thread killer.
 *   3. "focus"      — the existing one-question-at-a-time runtime.
 *
 * Plus a structural score showing how much of the decision tree is wired.
 * This does not evaluate factual correctness or expert verification.
 */

export type ReasoningMode = "focus" | "tree" | "walkthrough";

export interface TreeNodeLayout {
  node: Node;
  depth: number;
  /** 0-based row within the depth column; used for vertical placement. */
  row: number;
  /** True when the node cannot be reached from the root. */
  orphan: boolean;
}

export interface TreeEdgeLayout {
  from: string;
  to: string;
  decision: boolean;
}

export interface ReasoningTree {
  nodes: TreeNodeLayout[];
  edges: TreeEdgeLayout[];
  maxDepth: number;
  /** Largest number of nodes in any single depth column. */
  widestLayer: number;
}

const MAX_DEPTH = 40; // defensive: a corrupted brain could otherwise loop forever

/** Question nodes that are reachable start points, in preference order. */
export function resolveRootId(brain: Pick<Brain, "root_node_id">, nodes: Node[]): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (brain.root_node_id && byId.has(brain.root_node_id)) return brain.root_node_id;
  const firstQuestion = nodes.find((n) => n.node_type === "question");
  return firstQuestion?.id ?? nodes[0]?.id ?? null;
}

/**
 * Breadth-first layout. Guarantees:
 *  - every node appears at most once (cycles and duplicated references are
 *    collapsed rather than rendered twice or recursed forever);
 *  - nodes unreachable from the root are still returned (flagged `orphan`)
 *    so the creator can see the dangling parts of the tree;
 *  - depth/row are stable for a given input.
 */
export function layoutTree(
  brain: Pick<Brain, "root_node_id">,
  nodes: Node[],
): ReasoningTree {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rootId = resolveRootId(brain, nodes);
  const visited = new Set<string>();
  const layouts: TreeNodeLayout[] = [];
  const edges: TreeEdgeLayout[] = [];
  let maxDepth = 0;
  let widestLayer = 0;

  // children map first, so each layer preserves declaration order
  const queue: Array<{ id: string; depth: number }> = [];
  if (rootId) queue.push({ id: rootId, depth: 0 });

  const rowByDepth = new Map<number, number>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    const node = byId.get(id);
    if (!node || depth > MAX_DEPTH) continue;
    visited.add(id);

    const row = rowByDepth.get(depth) ?? 0;
    rowByDepth.set(depth, row + 1);
    layouts.push({ node, depth, row, orphan: false });
    maxDepth = Math.max(maxDepth, depth);
    widestLayer = Math.max(widestLayer, row + 1);

    const branches: Array<{ target: string | null | undefined; decision: boolean }> = [
      { target: node.if_true_node_id, decision: true },
      { target: node.if_false_node_id, decision: false },
    ];
    for (const { target, decision } of branches) {
      if (!target || !byId.has(target)) continue;
      edges.push({ from: id, to: target, decision });
      if (!visited.has(target)) queue.push({ id: target, depth: depth + 1 });
    }
  }

  // Orphans: present in the store but unreachable from the root.
  const lastRowByDepth = new Map(rowByDepth);
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const depth = 0;
    const row = lastRowByDepth.get(depth) ?? 0;
    lastRowByDepth.set(depth, row + 1);
    widestLayer = Math.max(widestLayer, row + 1);
    layouts.push({ node, depth, row, orphan: true });
    // Show orphan→child links too, so a disconnected subtree reads correctly.
    const branches: Array<{ target: string | null | undefined; decision: boolean }> = [
      { target: node.if_true_node_id, decision: true },
      { target: node.if_false_node_id, decision: false },
    ];
    for (const { target, decision } of branches) {
      if (!target || !byId.has(target)) continue;
      edges.push({ from: node.id, to: target, decision });
    }
  }

  return { nodes: layouts, edges, maxDepth, widestLayer };
}

export interface BrainConfidence {
  /** 0–100, rounded. */
  score: number;
  label: "Well connected" | "Mostly connected" | "Draft" | "Incomplete";
  questions: number;
  outcomes: number;
  maxDepth: number;
  /** Question nodes whose YES or NO branch is not wired. */
  danglingBranches: number;
  orphans: number;
}

/**
 * A rule-based structural completeness score. It does not check whether
 * the claims are correct, evidence-backed, or independently reviewed:
 *
 *   +40  has a reachable root and ≥1 question
 *   +20  has ≥1 outcome (a decision tree that never concludes is useless)
 *   +20  scaled by the share of questions with both branches wired
 *   +10  depth ≥ 2 (more than a single binary split)
 *   +10  no orphaned nodes (everything is connected)
 */
export function computeConfidence(
  brain: Pick<Brain, "root_node_id">,
  nodes: Node[],
): BrainConfidence {
  const questions = nodes.filter((n) => n.node_type === "question");
  const outcomes = nodes.filter((n) => n.node_type === "outcome");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const danglingBranches = questions.filter((q) => {
    const yes = q.if_true_node_id ? byId.has(q.if_true_node_id) : false;
    const no = q.if_false_node_id ? byId.has(q.if_false_node_id) : false;
    return !yes || !no;
  }).length;

  const tree = layoutTree(brain, nodes);
  const orphans = tree.nodes.filter((n) => n.orphan).length;
  const wiredShare = questions.length === 0 ? 0 : (questions.length - danglingBranches) / questions.length;

  let score = 0;
  if (resolveRootId(brain, nodes) && questions.length > 0) score += 40;
  if (outcomes.length > 0) score += 20;
  score += Math.round(20 * wiredShare);
  if (tree.maxDepth >= 2) score += 10;
  if (orphans === 0 && nodes.length > 0) score += 10;

  const label: BrainConfidence["label"] =
    score >= 90 ? "Well connected" : score >= 70 ? "Mostly connected" : score >= 40 ? "Draft" : "Incomplete";

  return {
    score,
    label,
    questions: questions.length,
    outcomes: outcomes.length,
    maxDepth: tree.maxDepth,
    danglingBranches,
    orphans,
  };
}

export interface WalkthroughStep {
  node: Node;
  depth: number;
  /** Human-readable "YES → <result>" summaries for each wired branch. */
  branches: Array<{ decision: boolean; target: Node }>;
  /** True when the node is a question with at least one unwired branch. */
  incomplete: boolean;
}

/**
 * Every reachable node in reading order (depth-first, YES branch first) so a
 * reader can scan the whole decision logic top-to-bottom without clicking.
 */
export function buildWalkthrough(
  brain: Pick<Brain, "root_node_id">,
  nodes: Node[],
): WalkthroughStep[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rootId = resolveRootId(brain, nodes);
  if (!rootId) return [];

  const seen = new Set<string>();
  const steps: WalkthroughStep[] = [];

  const walk = (id: string, depth: number) => {
    if (seen.has(id) || depth > MAX_DEPTH) return;
    const node = byId.get(id);
    if (!node) return;
    seen.add(id);

    const branches: Array<{ decision: boolean; target: Node }> = [];
    for (const [decision, targetId] of [
      [true, node.if_true_node_id],
      [false, node.if_false_node_id],
    ] as const) {
      const target = targetId ? byId.get(targetId) : undefined;
      if (target) branches.push({ decision, target });
    }

    steps.push({
      node,
      depth,
      branches,
      incomplete: node.node_type === "question" && branches.length < 2,
    });

    for (const { target } of branches) walk(target.id, depth + 1);
  };

  walk(rootId, 0);
  return steps;
}

/** One-line summary used in share previews and search results. */
export function summarizeBrain(
  brain: Pick<Brain, "root_node_id">,
  nodes: Node[],
): { headline: string; confidence: BrainConfidence } {
  const confidence = computeConfidence(brain, nodes);
  const headline =
    `${confidence.questions} question${confidence.questions === 1 ? "" : "s"} → ` +
    `${confidence.outcomes} outcome${confidence.outcomes === 1 ? "" : "s"} · ` +
    `${confidence.label} · structure ${confidence.score}/100`;
  return { headline, confidence };
}
