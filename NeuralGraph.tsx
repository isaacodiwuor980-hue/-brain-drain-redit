import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useToast } from '@/hooks/use-toast';

interface NeuralGraphProps {
  nodes: { id: string; name: string }[];
  links: { source: string; target: string }[];
  height?: number;
}

// d3's force simulation mutates node objects in place (adding x/y/vx/vy)
// and resolves link source/target strings to node references. These
// interfaces describe the post-resolution shape the tick callbacks read.
interface GraphNode {
  id: string;
  name: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}
interface GraphLink {
  source: GraphNode;
  target: GraphNode;
}

const WIDTH = 600;

/**
 * Force-directed topic graph.
 *
 * NOTE (Phase 3): the home feed no longer uses this — it now shows a real
 * reasoning tree (ui/reasoning-tree.tsx), which is deterministic, tells the
 * reader something true about a brain, and needs no graph library. This
 * component is kept for opt-in "network of topics" views.
 *
 * Fixed here (Phase 2 audit):
 *  - MEMORY LEAK: the d3 simulation was never stopped. On route change it
 *    kept ticking (and holding closures over the detached SVG) until GC,
 *    burning CPU on every navigation. It is now stopped + the svg cleared in
 *    the effect cleanup.
 *  - MUTATION LEAK: the simulation wrote x/y/vx/vy straight onto the props
 *    (React state objects), so a re-render could inherit stale geometry.
 *    Nodes are cloned first.
 *  - RENDER CHURN: memoized + keyed inputs, so an identical parent render no
 *    longer restarts the whole simulation.
 *  - Accessibility: the SVG had no role/label/empty state.
 */
export const NeuralGraph: React.FC<NeuralGraphProps> = memo(function NeuralGraph({
  nodes,
  links,
  height = 400,
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { toast } = useToast();
  const [failed, setFailed] = useState<string | null>(null);

  // Stable structural signature: re-running the simulation for a deep-equal
  // array (new identity, same content) was the main re-render cost.
  const signature = useMemo(
    () => `${nodes.map((n) => n.id).join(',')}|${links.map((l) => `${l.source}>${l.target}`).join(',')}`,
    [nodes, links],
  );

  useEffect(() => {
    if (!svgRef.current) return undefined;

    let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;

    try {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      // Clone: never mutate the caller's React state.
      const graphNodes: GraphNode[] = nodes.map((n) => ({ id: n.id, name: n.name, x: 0, y: 0 }));
      const validIds = new Set(graphNodes.map((n) => n.id));
      const graphLinks = links
        .filter((l) => validIds.has(l.source) && validIds.has(l.target))
        .map((l) => ({ source: l.source, target: l.target })) as unknown as GraphLink[];

      simulation = d3
        .forceSimulation<GraphNode>(graphNodes)
        .force('link', d3.forceLink<GraphNode, GraphLink>(graphLinks).id((d) => d.id))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(WIDTH / 2, height / 2))
        .force('collide', d3.forceCollide(18));

      const link = svg
        .append('g')
        .attr('stroke', 'currentColor')
        .attr('stroke-opacity', 0.35)
        .selectAll('line')
        .data(graphLinks)
        .enter()
        .append('line')
        .attr('stroke-width', 1.25);

      const node = svg
        .append('g')
        .selectAll('circle')
        .data(graphNodes)
        .enter()
        .append('circle')
        .attr('r', 9)
        .attr('fill', 'currentColor')
        .attr('fill-opacity', 0.85);

      const label = svg
        .append('g')
        .selectAll('text')
        .data(graphNodes)
        .enter()
        .append('text')
        .text((d) => d.name)
        .attr('font-size', '10px')
        .attr('fill', 'currentColor')
        .attr('fill-opacity', 0.8)
        .attr('dx', 12)
        .attr('dy', 4);

      simulation.on('tick', () => {
        link
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y);
        node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);
        label.attr('x', (d) => d.x).attr('y', (d) => d.y);
      });

      setFailed(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('NeuralGraph error:', e);
      setFailed(message || 'Failed to render graph');
      toast({
        title: 'Graph Render Error',
        description: message || 'Failed to render graph',
        variant: 'destructive',
      });
    }

    return () => {
      // LEAK FIX: stop ticking and release the DOM nodes on unmount /
      // dependency change. Without this the simulation ran forever against
      // a detached SVG after every route change.
      simulation?.stop();
      simulation = null;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ref is stable; d3 must be torn down synchronously here
      if (svgRef.current) d3.select(svgRef.current).selectAll('*').remove();
    };
    // toast/t is stable; signature captures the data identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, height]);

  if (nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[16px] border border-dashed border-border/60 text-sm text-muted-foreground"
        style={{ height }}
      >
        No connections to graph yet.
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={`Connection graph with ${nodes.length} nodes and ${links.length} links`}
      width="100%"
      height={height}
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="text-primary"
      data-graph-error={failed ?? undefined}
    />
  );
});
