import { useState, useEffect, useCallback } from "react";
import { BrainVersion, Branch, PullRequest } from "@/lib/types";
import { idb } from "@/lib/db";

/**
 * use-brain-repo — per-brain branch + version + PR store.
 *
 * Phase B-5: previously this used in-memory mock data. Now it reads and
 * writes the IDB `branches` + `pull_requests` stores (added in DB v13)
 * so branches survive reloads. BrainVersion history is still in-memory
 * for now (it's only used for the version-history UI; Phase 2 will
 * persist it with hash chaining).
 *
 * When a brain has no branches yet, we auto-seed a "main" branch on
 * first access so the BranchManagerSidebar always has something to show.
 */
export function useBrainRepo(brainId: string) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [versions, setVersions] = useState<BrainVersion[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [activeBranch, setActiveBranch] = useState<string>("main");

  // Load branches + PRs from IDB. Seed a "main" branch if none exist.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!brainId) {
        setBranches([]);
        setPullRequests([]);
        return;
      }
      const allBranches = await idb.getAll<Branch>("branches");
      const brainBranches = allBranches.filter((b) => b.brain_id === brainId);
      if (cancelled) return;

      if (brainBranches.length === 0) {
        // Auto-seed a "main" branch for this brain.
        const mainBranch: Branch = {
          id: crypto.randomUUID(),
          brain_id: brainId,
          name: "main",
          isMain: true,
          created_at: Date.now(),
        };
        await idb.put("branches", mainBranch);
        if (cancelled) return;
        setBranches([mainBranch]);
        setActiveBranch("main");
      } else {
        setBranches(brainBranches);
        // Pick the main branch as active, or the first one.
        const main = brainBranches.find((b) => b.isMain) ?? brainBranches[0];
        setActiveBranch(main?.name ?? "main");
      }

      const allPRs = await idb.getAll<PullRequest>("pull_requests");
      if (cancelled) return;
      const brainPRs = allPRs.filter((pr) => pr.brain_id === brainId);
      setPullRequests(brainPRs);

      // Versions stay in-memory for now (Phase 2 will persist them).
      setVersions([
        { id: "v1", brain_id: brainId, branch: "main", message: "Initial brain initialization", nodes: [], created_at: Date.now() - 86400000 },
      ]);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [brainId]);

  /**
   * Task 11: createBranch = FORK, not a blank brain.
   *
   * Previously this created an empty branch record with no nodes — editing on
   * the new branch would modify the main brain's shared node set. Now it:
   *   1. Creates the branch record (with parent_version_id lineage).
   *   2. Snapshots ALL main-branch nodes into per-branch copies with
   *      branch_id=<new branch id> + forked_from_node_id=<original node id>.
   *   3. Remaps if_true_node_id / if_false_node_id to the new forked node IDs
   *      so the forked brain is self-consistent.
   * Edits on the fork don't affect main until a PR merges them back.
   */
  const createBranch = useCallback(async (name: string) => {
    if (!brainId) return;
    const newBranchId = crypto.randomUUID();
    const newBranch: Branch = {
      id: newBranchId,
      brain_id: brainId,
      name,
      isMain: false,
      created_at: Date.now(),
      parent_version_id: "main", // lineage: forked from main
    };
    await idb.put("branches", newBranch);

    // Fork all main-branch nodes (branch_id undefined or "main") into copies.
    const allNodes = await idb.getAllByIndex<import("@/lib/types").Node>("nodes", "brain_id", brainId);
    const mainNodes = allNodes.filter((n) => !n.branch_id || n.branch_id === "main");

    // Map old node id → new forked node id so we can remap edges.
    const idMap = new Map<string, string>();
    for (const n of mainNodes) {
      idMap.set(n.id, crypto.randomUUID());
    }

    const forkedNodes: import("@/lib/types").Node[] = mainNodes.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      branch_id: newBranchId,
      forked_from_node_id: n.id,
      if_true_node_id: n.if_true_node_id ? (idMap.get(n.if_true_node_id) ?? null) : null,
      if_false_node_id: n.if_false_node_id ? (idMap.get(n.if_false_node_id) ?? null) : null,
    }));

    if (forkedNodes.length > 0) {
      await idb.putAll("nodes", forkedNodes);
    }

    setBranches((prev) => [...prev, newBranch]);
  }, [brainId]);

  const switchBranch = useCallback((idOrName: string) => {
    // Tolerate either a UUID or a name so this works regardless of how
    // the caller is wired (Select passes the name).
    const branch = branches.find((b) => b.id === idOrName || b.name === idOrName);
    if (branch) {
      setActiveBranch(branch.name);
    }
  }, [branches]);

  const deleteBranch = useCallback(async (id: string) => {
    await idb.delete("branches", id);
    setBranches((prev) => prev.filter((b) => b.id !== id));
  }, []);

  /**
   * Task 10: create a tag on a branch. Tags are stored on the branch's `tags`
   * array (e.g. "v1.0", "stable", "experiment"). Idempotent — adding a tag
   * that already exists on that branch is a no-op.
   */
  const createTag = useCallback(async (branchId: string, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const branch = await idb.get<Branch>("branches", branchId);
    if (!branch) return;
    const existing = branch.tags ?? [];
    if (existing.includes(trimmed)) return; // idempotent
    const updated = { ...branch, tags: [...existing, trimmed] };
    await idb.put("branches", updated);
    setBranches((prev) => prev.map((b) => (b.id === branchId ? updated : b)));
  }, []);

  return { branches, versions, pullRequests, activeBranch, createBranch, switchBranch, deleteBranch, createTag };
}
