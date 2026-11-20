/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavDrawer } from "../layout/MobileNavDrawer";

// happy-dom's animation cancellation rejects; exercise dialog behavior without animation.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const Div = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }>(
    ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }, ref) => <div ref={ref} {...props} />,
  );
  return { motion: { div: Div }, AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

const Icon = () => <svg aria-hidden="true" />;
const sections = [{ label: "Explore", items: [{ href: "/community", label: "Community", icon: Icon }, { href: "/messages", label: "Messages", icon: Icon }] }];
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("mobile navigation sheet", () => {
  it("marks nested sections, locks background scrolling, and restores it on close", async () => {
    const close = vi.fn();
    await act(async () => root.render(<MobileNavDrawer open onClose={close} sections={sections} currentPath="/community/circle" onLinkClick={vi.fn()} />));
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("More navigation");
    expect(container.querySelector('a[href="/community"]')?.getAttribute("aria-current")).toBe("page");
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).toHaveBeenCalledOnce();
    await act(async () => root.render(<MobileNavDrawer open={false} onClose={close} sections={sections} currentPath="/" onLinkClick={vi.fn()} />));
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
