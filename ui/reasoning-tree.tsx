import { useMemo } from "react";
import { Link2 } from "lucide-react";
import type { Brain, Node } from "@/lib/types";
import { layoutTree } from "@/lib/reasoning-view";
import { cn } from "@/lib/utils";

/**
 * ReasoningTree — a dependency-free visual reasoning tree.
 *
 * WHY not d3: the previous graph on the home feed was a random force
 * simulation of *topics*, which (a) added d3 to a lazy chunk, (b) was
 * non-deterministic so it never looked the same twice, and (c) told the reader
 * nothing about a brain's logic. This renders the ACTUAL decision tree with a
 * fixed layered layout: depth flows left→right, branches are colour-coded
 * YES/NO, and unwired branches / orphans are visibly badged so the missing
 * reasoning is obvious rather than hidden in an editor.
 */
export interface ReasoningTreeProps {
  brain: Pick<Brain, "root_node_id">;
  nodes: Node[];
  /** Highlight + scroll to this node (used by the walkthrough link). */
  activeNodeId?: string | null;
  onNodeClick?: (node: Node) => void;
  className?: string;
}

const COL_W = 210;
const ROW_H = 92;
const PAD = 24;
const NODE_W = 168;
const NODE_H = 56;

export function ReasoningTree({ brain, nodes, activeNodeId, onNodeClick, className }: ReasoningTreeProps) {
  const tree = useMemo(() => layoutTree(brain, nodes), [brain, nodes]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const layout of tree.nodes) {
      map.set(layout.node.id, {
        x: PAD + layout.depth * COL_W,
        y: PAD + layout.row * ROW_H,
      });
    }
    return map;
  }, [tree]);

  const width = PAD * 2 + Math.max(tree.maxDepth, 0) * COL_W + NODE_W;
  const height = PAD * 2 + Math.max(tree.widestLayer, 1) * ROW_H;

  if (tree.nodes.length === 0) {
    return (
      <div className={cn("flex items-center justify-center rounded-[16px] border border-dashed border-border/60 p-8 text-sm text-muted-foreground", className)}>
        This brain has no nodes to visualise yet.
      </div>
    );
  }

  return (
    <div className={cn("overflow-auto rounded-[16px] border border-border/50 bg-card/30", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="Decision tree — questions branch to outcomes"
        className="block min-w-full"
      >
        <defs>
          <marker id="arrow-yes" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-emerald-500" />
          </marker>
          <marker id="arrow-no" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-rose-500" />
          </marker>
        </defs>

        {tree.edges.map((edge, i) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const midX = (x1 + x2) / 2;
          const isYes = edge.decision;
          return (
            <g key={`${edge.from}-${edge.to}-${i}`}>
              <path
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                strokeWidth={1.75}
                className={isYes ? "stroke-emerald-500/60" : "stroke-rose-500/60"}
                markerEnd={isYes ? "url(#arrow-yes)" : "url(#arrow-no)"}
              />
              <text
                x={midX}
                y={(y1 + y2) / 2 - 4}
                textAnchor="middle"
                className={cn("text-[9px] font-mono font-bold", isYes ? "fill-emerald-500" : "fill-rose-500")}
              >
                {isYes ? "YES" : "NO"}
              </text>
            </g>
          );
        })}

        {tree.nodes.map(({ node, orphan }) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const isOutcome = node.node_type === "outcome";
          const isActive = activeNodeId === node.id;
          const label = isOutcome ? node.result_text || "Outcome" : node.question_text || "Question";
          const truncated = label.length > 46 ? `${label.slice(0, 46)}…` : label;
          const dangling =
            node.node_type === "question" && (!node.if_true_node_id || !node.if_false_node_id);
          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={() => onNodeClick?.(node)}
              className={onNodeClick ? "cursor-pointer" : undefined}
              tabIndex={onNodeClick ? 0 : undefined}
              role={onNodeClick ? "button" : undefined}
              aria-label={`${isOutcome ? "Outcome" : "Question"}: ${label}`}
              onKeyDown={(e) => {
                if (onNodeClick && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onNodeClick(node);
                }
              }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={12}
                className={cn(
                  "fill-background transition-colors",
                  isActive ? "stroke-primary stroke-[2.5]" : "stroke-border",
                  orphan && "stroke-dashed stroke-amber-500",
                  isOutcome && !isActive && "fill-emerald-500/5",
                )}
                strokeDasharray={orphan ? "4 3" : undefined}
              />
              <text x={10} y={15} className="fill-muted-foreground text-[8px] font-mono uppercase tracking-wider">
                {orphan ? "UNREACHABLE" : isOutcome ? "OUTCOME" : "QUESTION"}
                {dangling ? " · UNWIRED" : ""}
              </text>
              <text x={10} y={31} className="fill-foreground text-[10px] font-semibold">
                {truncated.slice(0, 30)}
              </text>
              {truncated.length > 30 && (
                <text x={10} y={44} className="fill-foreground text-[10px] font-semibold">
                  {truncated.slice(30)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-4 border-t border-border/40 px-3 py-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> YES branch
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> NO branch
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Link2 className="h-3 w-3" /> {tree.nodes.length} nodes · depth {tree.maxDepth}
        </span>
      </div>
    </div>
  );
}
