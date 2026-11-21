/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTsrgStatus } from "./use-tsrg-status";
import { orderFeed } from "../lib/tsrg/feed";
import type { Post } from "../lib/types";
const posts = [{ id: "older", createdAt: 1, reactions: { upvote: 100, downvote: 0 } }, { id: "newer", createdAt: 2, reactions: { upvote: 0, downvote: 2 } }] as Post[];
function Feed() { const enabled = useTsrgStatus(true); return <div>{orderFeed(posts, "foryou", enabled, 3).map(p => p.id).join(",")}</div>; }
let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers(); vi.spyOn(console, "warn").mockImplementation(() => {}); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe("experimental feed status hook", () => {
  it("times out and continues chronological ranking", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await act(async () => root.render(<Feed />));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(container.textContent).toBe("newer,older");
    expect(console.warn).toHaveBeenCalledWith({ event: "tsrg_status_checked", available: false, reason: "timeout" });
  });
  it("ranks experimentally only after an enabled response; offline event restores default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ experimental_feed_available: true, scope: "online-clients-only" }) }));
    await act(async () => { root.render(<Feed />); });
    expect(container.textContent).toBe("older,newer");
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(container.textContent).toBe("newer,older");
  });
});
