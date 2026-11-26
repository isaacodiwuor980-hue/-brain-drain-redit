import type { Mind, Node } from "../types";
import { api, ApiError } from "../api-client";

export interface CloudMind extends Mind {
  authorId?: string | null;
  isPublic?: boolean;
}

export interface ListMindsResponse {
  minds: CloudMind[];
  hasMore: boolean;
  source: string;
}

export interface MindDetailResponse {
  mind: CloudMind;
  nodes: Node[];
  source: string;
}

export interface UpsertMindInput {
  mind: Omit<Mind, "created_at"> & {
    is_public?: boolean;
    is_favorite?: boolean;
  };
  nodes: Node[];
}

export function isMindsError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

export async function listMinds(
  options: { mine?: boolean; limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<ListMindsResponse> {
  const params = new URLSearchParams();
  if (options.mine) params.set("mine", "true");
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return api.get<ListMindsResponse>(`/api/minds${qs ? `?${qs}` : ""}`, {
    signal: options.signal,
    retries: 1,
  });
}

export async function getMind(
  id: string,
  signal?: AbortSignal,
): Promise<MindDetailResponse> {
  return api.get<MindDetailResponse>(`/api/minds/${encodeURIComponent(id)}`, {
    signal,
    retries: 1,
  });
}

export async function saveMind(
  input: UpsertMindInput,
  authToken?: string | null,
): Promise<void> {
  await api.post(
    "/api/minds",
    {
      mind: {
        ...input.mind,
        is_public: input.mind.is_public ?? false,
      },
      nodes: input.nodes,
    },
    {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    },
  );
}

export async function deleteMind(
  id: string,
  authToken?: string | null,
): Promise<void> {
  await api.request(`/api/minds/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
}
