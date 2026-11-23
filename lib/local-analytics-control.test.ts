import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { idb, resetDBConnection } from "./db";
import { clearLocalAnalytics, getLocalAnalyticsControl, getVisibleAnalyticsEvents, recordLocalAnalytics, setLocalAnalyticsEnabled } from "./local-analytics-control";
const event = { id: "event-1", createdAt: 1 };
beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => { resetDBConnection(); vi.unstubAllGlobals(); });
describe("browser-only activity controls", () => {
  it("keeps legacy collection on until changed", async () => { expect((await getLocalAnalyticsControl()).enabled).toBe(true); expect(await recordLocalAnalytics(event)).toBe(0); expect(await getVisibleAnalyticsEvents()).toEqual([event]); });
  it("honors an earlier saved-off preference until explicitly enabled", async () => {
    await idb.putStrict("settings", {id:"privacy-settings",dataCollection:false});
    expect((await getLocalAnalyticsControl()).enabled).toBe(false);
    expect(await recordLocalAnalytics(event)).toBeNull();
    await setLocalAnalyticsEnabled(true); expect(await recordLocalAnalytics(event)).not.toBeNull();
  });
  it("stops recording and hides saved activity while off, without deleting it", async () => { await recordLocalAnalytics(event); await setLocalAnalyticsEnabled(false); expect(await recordLocalAnalytics({id:"event-2",createdAt:2})).toBeNull(); expect(await getVisibleAnalyticsEvents()).toEqual([]); expect(await idb.getAllStrict("analytics_events")).toEqual([event]); await setLocalAnalyticsEnabled(true); expect(await getVisibleAnalyticsEvents()).toEqual([event]); });
  it("clears only analytics and advances the version without changing the preference", async () => { await idb.putStrict("settings", {id:"other",value:true}); await recordLocalAnalytics(event); await clearLocalAnalytics(); expect(await getVisibleAnalyticsEvents()).toEqual([]); expect(await idb.getAllStrict("settings")).toContainEqual({id:"other",value:true}); expect(await getLocalAnalyticsControl()).toEqual({ enabled:true, epoch:1 }); });
  it("serializes writes with disabling and clearing", async () => { await Promise.all([recordLocalAnalytics(event), setLocalAnalyticsEnabled(false), clearLocalAnalytics(), recordLocalAnalytics({id:"late",createdAt:2})]); expect(await getVisibleAnalyticsEvents()).toEqual([]); expect(await idb.getAllStrict("analytics_events")).toEqual([]); });
  it("reports storage failure rather than claiming success", async () => { resetDBConnection(); vi.stubGlobal("indexedDB", undefined); await expect(setLocalAnalyticsEnabled(false)).rejects.toMatchObject({name:"SecurityError"}); await expect(clearLocalAnalytics()).rejects.toMatchObject({name:"SecurityError"}); });
});
