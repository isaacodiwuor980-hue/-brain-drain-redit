/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickDecision } from "../ui/quick-decision";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function button(text: string): HTMLButtonElement {
  const result = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!result) throw new Error(`Button not found: ${text}`);
  return result;
}

async function reachOutcome() {
  for (let i = 0; i < 10 && !container.textContent?.includes("Keep this brain"); i++) {
    await act(async () => button("YES").click());
  }
  expect(container.textContent).toContain("Keep this brain");
}

describe("quick decision save feedback", () => {
  it("does not claim success on failure and permits a retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("storage blocked")).mockResolvedValueOnce(undefined);
    await act(async () => root.render(<QuickDecision onSaveBrain={save} />));
    await reachOutcome();
    await act(async () => button("Keep this brain").click());
    expect(container.textContent).not.toContain("Saved to your library");
    expect(button("Keep this brain").disabled).toBe(false);
    await act(async () => button("Keep this brain").click());
    expect(container.textContent).toContain("Saved to your library");
    expect(save).toHaveBeenCalledTimes(2);
  });
});
