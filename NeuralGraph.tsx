import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useToast } from '@/hooks/use-toast';

interface NeuralGraphProps {
  nodes: { id: string; name: string }[];
  links: { source: string; target: string }[];
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

export const NeuralGraph: React.FC<NeuralGraphProps> = ({ nodes, links }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 600;
    const height = 400;

    try {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      // The prop arrays are plain {id,name}/{source,target} — d3 fills in
      // the simulation fields and resolves link endpoints to node refs, so
      // cast to the resolved shapes once and reuse across selections.
      const graphNodes = nodes as unknown as GraphNode[];
      const graphLinks = links as unknown as GraphLink[];

      const simulation = d3.forceSimulation<GraphNode>(graphNodes)
        .force('link', d3.forceLink<GraphNode, GraphLink>(graphLinks).id((d) => d.id))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2));

      const link = svg.append('g')
        .selectAll('line')
        .data(graphLinks)
        .enter().append('line')
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6);

      const node = svg.append('g')
        .selectAll('circle')
        .data(graphNodes)
        .enter().append('circle')
        .attr('r', 10)
        .attr('fill', '#69b3a2');

      const label = svg.append('g')
        .selectAll('text')
        .data(graphNodes)
        .enter().append('text')
        .text((d) => d.name)
        .attr('font-size', '10px')
        .attr('dx', 12)
        .attr('dy', 4);

      simulation.on('tick', () => {
        link
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y);

        node
          .attr('cx', (d) => d.x)
          .attr('cy', (d) => d.y);

        label
          .attr('x', (d) => d.x)
          .attr('y', (d) => d.y);
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("NeuralGraph error:", e);
      toast({ title: "Graph Render Error", description: message || "Failed to render graph", variant: "destructive" });
    }
  }, [nodes, links, toast]);

  return <svg ref={svgRef} width="100%" height="400" viewBox="0 0 600 400" />;
};
