import type { Brain } from "./types";

/** Keep local edits until versioned conflict resolution is available. */
export function mergeCloudWithLocal(cloudBrains: Brain[], localBrains: Brain[]): Brain[] {
  const localById = new Map(localBrains.map((brain) => [brain.id, brain]));
  const cloudIds = new Set(cloudBrains.map((brain) => brain.id));
  return [
    ...cloudBrains.map((brain) => localById.get(brain.id) ?? brain),
    ...localBrains.filter((brain) => !cloudIds.has(brain.id)),
  ];
}
