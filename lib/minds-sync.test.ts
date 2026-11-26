import { describe, expect, it } from "vitest";
import type { Mind } from "./types";

// Mirrors the mergeCloudWithLocal contract in hooks/use-database.ts.
function mergeCloudWithLocal(cloudMinds: Mind[], localMinds: Mind[]): Mind[] {
  const cloudIds = new Set(cloudMinds.map((b) => b.id));
  const localOnly = localMinds.filter((b) => !cloudIds.has(b.id));
  return [...cloudMinds, ...localOnly];
}

const mind = (id: string, overrides: Partial<Mind> = {}): Mind => ({
  id,
  title: `Mind ${id}`,
  category: "",
  description: "",
  root_node_id: null,
  created_at: Date.now(),
  ...overrides,
});

describe("mergeCloudWithLocal (minds)", () => {
  it("keeps local-only (seeded/offline) minds alongside cloud minds", () => {
    const cloud = [mind("c1")];
    const local = [mind("seed-1"), mind("seed-2")];
    const merged = mergeCloudWithLocal(cloud, local);
    expect(merged).toHaveLength(3);
    expect(merged.map((b) => b.id)).toEqual(["c1", "seed-1", "seed-2"]);
  });

  it("lets the cloud mind win on ID collisions", () => {
    const cloud = [mind("b1", { title: "Cloud title", category: "cloud" })];
    const local = [mind("b1", { title: "Local title", category: "local" })];
    const merged = mergeCloudWithLocal(cloud, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Cloud title");
  });

  it("returns cloud minds when local is empty", () => {
    expect(mergeCloudWithLocal([mind("c1")], [])).toHaveLength(1);
  });

  it("does not duplicate minds present in both", () => {
    const cloud = [mind("b1"), mind("b2")];
    const local = [mind("b1"), mind("b3")];
    const merged = mergeCloudWithLocal(cloud, local);
    const ids = merged.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["b1", "b2", "b3"]);
  });
});
