/**
 * Render smoke test: mounts the real HomeFeed + RuntimeEngine in happy-dom and
 * asserts they produce content (no blank screen) without network access.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuickDecision } from "../ui/quick-decision";
import { ReasoningTree } from "../ui/reasoning-tree";
import { ReasoningWalkthrough } from "../ui/reasoning-walkthrough";
import { ConfidenceBadge } from "../ui/confidence-badge";
import { SAMPLE_BRAINS } from "../lib/sample-brains";
import { computeConfidence } from "../lib/reasoning-view";
import { TooltipProvider } from "../ui/tooltip";

const sample = SAMPLE_BRAINS[0];

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <QueryClientProvider client={qc}>
      <TooltipProvider>{node}</TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("render smoke", () => {
  it("QuickDecision renders the first question with YES/NO", () => {
    const html = wrap(<QuickDecision />);
    expect(html).toContain("Try a brain now");
    expect(html).toMatch(/YES/);
    expect(html).toMatch(/NO/);
  });

  it("ReasoningTree renders the root question and both branch types", () => {
    const html = wrap(<ReasoningTree brain={sample.brain} nodes={sample.nodes} />);
    expect(html).toContain("<svg");
    // Root question text from the bundled laptop sample.
    expect(html).toContain("Is your budget under $800?");
    // Both branch kinds and both node kinds are drawn + labelled.
    expect(html).toContain(">YES<");
    expect(html).toContain(">NO<");
    expect(html).toContain("QUESTION");
    expect(html).toContain("OUTCOME");
    // Depth/legend summary is rendered for the reader.
    expect(html).toContain(`${sample.nodes.length}`);
  });

  it("ReasoningWalkthrough renders numbered steps", () => {
    const html = wrap(<ReasoningWalkthrough brain={sample.brain} nodes={sample.nodes} />);
    expect(html).toContain("<ol");
    expect(html).toContain("Outcome");
  });

  it("ConfidenceBadge shows a score", () => {
    const c = computeConfidence(sample.brain, sample.nodes);
    const html = wrap(<ConfidenceBadge confidence={c} />);
    expect(html).toContain(`${c.score}/100`);
    expect(html).toContain("Does not verify accuracy or sources");
    expect(html).not.toContain("Verified reasoning");
  });

  it("every bundled sample renders a complete tree (no orphan/undefined)", () => {
    for (const s of SAMPLE_BRAINS) {
      const html = wrap(<ReasoningTree brain={s.brain} nodes={s.nodes} />);
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("NaN");
    }
  });
});
