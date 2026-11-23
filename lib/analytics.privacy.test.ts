// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { idb, resetDBConnection } from "./db";
import { clearLocalAnalytics, setLocalAnalyticsEnabled } from "./local-analytics-control";
import { flushAnalyticsEvents, getAnalyticsEvents, setQueryClientRef, trackEvent } from "./analytics";

beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {status:200, headers:{"content-type":"application/json"}}))); });
afterEach(async () => { setQueryClientRef(null); await clearLocalAnalytics().catch(() => undefined); resetDBConnection(); vi.unstubAllGlobals(); });
describe("local activity privacy integration", () => {
  it("does not persist, use, or send newly recorded events when disabled", async () => {
    await setLocalAnalyticsEnabled(false); await trackEvent("topic_selected", {topicId:"example"}); await flushAnalyticsEvents();
    expect(await idb.getAllStrict("analytics_events")).toEqual([]); expect(await getAnalyticsEvents()).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
  it("hides existing signals while disabled and keeps them until explicitly cleared", async () => {
    await trackEvent("topic_selected", {topicId:"example"}); expect(await getAnalyticsEvents()).toHaveLength(1);
    await setLocalAnalyticsEnabled(false); expect(await getAnalyticsEvents()).toEqual([]); expect(await idb.getAllStrict("analytics_events")).toHaveLength(1);
    await setLocalAnalyticsEnabled(true); expect(await getAnalyticsEvents()).toHaveLength(1);
    await clearLocalAnalytics(); expect(await getAnalyticsEvents()).toEqual([]); await flushAnalyticsEvents(); expect(fetch).not.toHaveBeenCalled();
  });
  it("clears cached activity immediately when the setting changes", async () => {
    const qc = { cancelQueries: vi.fn(), setQueryData: vi.fn(), invalidateQueries: vi.fn() }; setQueryClientRef(qc);
    await setLocalAnalyticsEnabled(false);
    expect(qc.cancelQueries).toHaveBeenCalledWith({queryKey:["analytics_events"]});
    expect(qc.setQueryData).toHaveBeenCalledWith(["analytics_events"], []);
    expect(qc.invalidateQueries).toHaveBeenCalledWith({queryKey:["analytics_events"]});
  });
  it("discards queued activity when another tab clears browser storage", async () => {
    await trackEvent("topic_selected", {topicId:"example"});
    window.dispatchEvent(new StorageEvent("storage", {key:null}));
    await flushAnalyticsEvents(); expect(fetch).not.toHaveBeenCalled();
  });
  it("aborts an in-flight send and does not retry it after turning activity off", async () => {
    let signal: AbortSignal | undefined;
    let notifyStarted!: () => void;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    vi.mocked(fetch).mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      notifyStarted();
    }));
    await trackEvent("topic_selected", {topicId:"example"});
    const sending = flushAnalyticsEvents(); await started;
    await setLocalAnalyticsEnabled(false); await sending;
    expect(signal?.aborted).toBe(true);
    await setLocalAnalyticsEnabled(true); await flushAnalyticsEvents();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("allows events again after explicit enable", async () => {
    await setLocalAnalyticsEnabled(false); await setLocalAnalyticsEnabled(true); await trackEvent("topic_selected", {topicId:"example"}); await flushAnalyticsEvents();
    expect(fetch).toHaveBeenCalledTimes(1); expect(await getAnalyticsEvents()).toHaveLength(1);
  });
  it("drops a queued batch if the preference cannot be checked, rather than replaying later", async () => {
    await trackEvent("topic_selected", {topicId:"example"});
    resetDBConnection(); vi.stubGlobal("indexedDB", undefined);
    await flushAnalyticsEvents(); expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal("indexedDB", new IDBFactory());
    await flushAnalyticsEvents(); expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed when browser preference storage is unavailable", async () => {
    resetDBConnection(); vi.stubGlobal("indexedDB", undefined); await trackEvent("topic_selected", {topicId:"example"}); await flushAnalyticsEvents(); expect(fetch).not.toHaveBeenCalled(); expect(await getAnalyticsEvents()).toEqual([]);
  });
});
