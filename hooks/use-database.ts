import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { getAnalyticsEvents } from "@/lib/analytics";
import { rankMindsByLocalSignals } from "@/lib/recommendations";
import { Mind, Node, MindData } from "@/lib/types";
import { env } from "@/lib/env";
import { listMinds, saveMind as saveMindApi, deleteMind as deleteMindApi, isMindsError } from "@/lib/api/minds";
import { getAuthToken } from "@/lib/auth-token";

const generateId = () => crypto.randomUUID();

// Module-level guard so concurrent `useDatabase` mounts in the same JS
// context don't both try to seed IDB at once.
let seedInProgress = false;

export function useDatabase() {
  const queryClient = useQueryClient();

  const { data: minds = [], isLoading } = useQuery<Mind[]>({
    queryKey: ["minds"],
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    queryFn: async () => {
      const cached = await idb.getAll<Mind>("minds");

      // Seed starter content on a fresh device. Guard against concurrent
      // mounts racing to seed — the in-memory flag prevents double-seeding
      // within the same JS context, and the IDB recheck after acquiring the
      // flag prevents a parallel mount from inserting duplicate seeds.
      if (cached.length === 0 && !seedInProgress) {
        seedInProgress = true;
        try {
          const recheck = await idb.getAll<Mind>("minds");
          if (recheck.length === 0) {
            await seedDatabase();
          }
        } finally {
          seedInProgress = false;
        }
      }
      const localMinds = await idb.getAll<Mind>("minds");

      // Same-origin API when VITE_API_BASE_URL is empty — see lib/env.ts.
      if (!env.apiEnabled) {
        const events = await getAnalyticsEvents();
        return rankMindsByLocalSignals(localMinds, events);
      }

      try {
        // Signed-in users see their own minds; guests see public ones.
        const token = await getAuthToken();
        const response = await listMinds({ mine: Boolean(token), limit: 100 });

        // Cache cloud minds, preserving any local-only (seeded/offline) minds.
        if (response.minds.length > 0) {
          await idb.putAll("minds", response.minds as Mind[]);
        }
        const merged = mergeCloudWithLocal(response.minds as Mind[], localMinds);
        const events = await getAnalyticsEvents();
        return rankMindsByLocalSignals(merged, events);
      } catch (error) {
        if (isMindsError(error, 401)) {
          // Token issue — fall back to public + local.
          try {
            const response = await listMinds({ mine: false, limit: 100 });
            if (response.minds.length > 0) {
              await idb.putAll("minds", response.minds as Mind[]);
            }
            const merged = mergeCloudWithLocal(response.minds as Mind[], localMinds);
            const events = await getAnalyticsEvents();
            return rankMindsByLocalSignals(merged, events);
          } catch {
            // fall through to local
          }
        }
        const events = await getAnalyticsEvents();
        return rankMindsByLocalSignals(localMinds, events);
      }
    },
  });

  const getMindData = async (mindId: string): Promise<MindData | null> => {
    const mind = await idb.get<Mind>("minds", mindId);
    if (!mind) return null;
    const nodes = await idb.getAllByIndex<Node>("nodes", "mind_id", mindId);
    return { mind, nodes };
  };

  const saveMindDataMutation = useMutation({
    mutationFn: async (data: MindData) => {
      // Optimistic local write.
      await idb.put("minds", data.mind);
      await idb.putAll("nodes", data.nodes);

      // Same-origin API when VITE_API_BASE_URL is empty — see lib/env.ts.
      if (!env.apiEnabled) return;

      try {
        const token = await getAuthToken();
        // Only sync minds authored by the signed-in user. Guests keep minds local.
        if (token) {
          await saveMindApi(
            {
              mind: {
                ...data.mind,
                is_public: (data.mind as Mind & { isPublic?: boolean }).isPublic ?? false,
              },
              nodes: data.nodes,
            },
            token,
          );
        }
      } catch (error) {
        // Message only — no stack dump for an expected offline/auth deferral.
        console.warn(
          "Mind saved locally, cloud sync deferred:",
          error instanceof Error ? error.message : error,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["minds"] });
    },
  });

  const deleteMindMutation = useMutation({
    mutationFn: async (mindId: string) => {
      await idb.delete("minds", mindId);
      const nodes = await idb.getAllByIndex<Node>("nodes", "mind_id", mindId);
      await idb.deleteAll(
        "nodes",
        nodes.map((n) => n.id),
      );

      // Same-origin API when VITE_API_BASE_URL is empty — see lib/env.ts.
      if (!env.apiEnabled) return;
      try {
        const token = await getAuthToken();
        if (token) await deleteMindApi(mindId, token);
      } catch (error) {
        console.warn("Mind deleted locally, cloud delete deferred", error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["minds"] });
    },
  });

  const exportData = async () => {
    const allMinds = await idb.getAll<Mind>("minds");
    const allNodes = await idb.getAll<Node>("nodes");
    const exportObj = { minds: allMinds, nodes: allNodes };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mind-builder-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    minds,
    isLoading,
    getMindData,
    saveMindData: saveMindDataMutation.mutateAsync,
    deleteMind: deleteMindMutation.mutateAsync,
    exportData,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["minds"] }),
  };
}

function mergeCloudWithLocal(cloudMinds: Mind[], localMinds: Mind[]): Mind[] {
  const cloudIds = new Set(cloudMinds.map((b) => b.id));
  // Keep seeded/local-only minds so the UI is never empty; cloud minds win
  // on ID collisions.
  const localOnly = localMinds.filter((b) => !cloudIds.has(b.id));
  return [...cloudMinds, ...localOnly];
}

async function seedDatabase() {
  const b1Id = generateId();
  const b1n1Id = generateId();
  const b1n2Id = generateId();
  const b1n3Id = generateId();
  const b1n4Id = generateId();
  const b1n5Id = generateId();

  const mind1: Mind = {
    id: b1Id,
    title: "Solar Panel Installation Expert",
    category: "Renewable Energy, China Solars, Large Scale",
    description: "Binary diagnostic for mounting, tilt, and wind load decisions for professional installers.",
    created_at: Date.now(),
    root_node_id: b1n1Id,
  };

  const mind1Nodes: Node[] = [
    { id: b1n1Id, mind_id: b1Id, node_type: "question", question_text: "Is the roof angle greater than 30 degrees?", if_true_node_id: b1n2Id, if_false_node_id: b1n3Id },
    { id: b1n2Id, mind_id: b1Id, node_type: "outcome", result_text: "Use Fixed Tilt Brackets", next_steps: "Use 15° fixed tilt, check rail span <=1.8m, torque to 12Nm." },
    { id: b1n3Id, mind_id: b1Id, node_type: "question", question_text: "Is design wind load > 120 km/h?", if_true_node_id: b1n4Id, if_false_node_id: b1n5Id },
    { id: b1n4Id, mind_id: b1Id, node_type: "outcome", result_text: "Use Reinforced Racking + Ballast", next_steps: "Add mid-clamps every 400mm, ballast >=80kg/m², verify uplift." },
    { id: b1n5Id, mind_id: b1Id, node_type: "outcome", result_text: "Standard Flush Mount", next_steps: "Portrait layout, 2 rails, L-feet at 1.2m spacing." },
  ];

  const b2Id = generateId();
  const b2n1Id = generateId();
  const b2n2Id = generateId();
  const b2n3Id = generateId();
  const b2n4Id = generateId();
  const b2n5Id = generateId();

  const mind2: Mind = {
    id: b2Id,
    title: "Medical Triage - Fever Pathway",
    category: "Medical, Primary Care",
    description: "Simple yes/no triage for adult fever to guide next steps (educational only).",
    created_at: Date.now() - 100000,
    root_node_id: b2n1Id,
  };

  const mind2Nodes: Node[] = [
    { id: b2n1Id, mind_id: b2Id, node_type: "question", question_text: "Is temperature >= 39.5°C or lasting >3 days?", if_true_node_id: b2n2Id, if_false_node_id: b2n3Id },
    { id: b2n2Id, mind_id: b2Id, node_type: "outcome", result_text: "Seek urgent care", next_steps: "Hydrate, avoid NSAIDs if contraindicated, monitor red flags." },
    { id: b2n3Id, mind_id: b2Id, node_type: "question", question_text: "Any difficulty breathing or chest pain?", if_true_node_id: b2n4Id, if_false_node_id: b2n5Id },
    { id: b2n4Id, mind_id: b2Id, node_type: "outcome", result_text: "Call emergency services", next_steps: "" },
    { id: b2n5Id, mind_id: b2Id, node_type: "outcome", result_text: "Home care", next_steps: "Rest, fluids, paracetamol as directed, recheck in 24h." },
  ];

  await idb.putAll("minds", [mind1, mind2]);
  await idb.putAll("nodes", [...mind1Nodes, ...mind2Nodes]);
}
