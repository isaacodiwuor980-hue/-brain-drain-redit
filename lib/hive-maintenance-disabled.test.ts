import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({getAll:vi.fn(), get:vi.fn(), put:vi.fn()}));
vi.mock("./db", () => ({idb:mock}));
import { runHiveMindMaintenance } from "./hive-mind";
describe("automatic hive maintenance containment", () => {
  beforeEach(() => {vi.clearAllMocks();mock.getAll.mockResolvedValue([]);});
  it("does not read or modify local content, points, notifications or timers", async () => {
    const storage = {getItem:vi.fn(), setItem:vi.fn()};
    vi.stubGlobal("localStorage", storage);
    try {
      await runHiveMindMaintenance(); await runHiveMindMaintenance();
      expect(mock.getAll).not.toHaveBeenCalled(); expect(mock.get).not.toHaveBeenCalled(); expect(mock.put).not.toHaveBeenCalled();
      expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
    } finally {vi.unstubAllGlobals();}
  });
  it("is not launched by App on startup", () => {
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(app).not.toContain("runHiveMindMaintenance");
  });
});
