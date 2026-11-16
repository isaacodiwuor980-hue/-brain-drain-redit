/**
 * Shared, pure computations for the MissionsPage accountability and
 * progression surfaces. Extracted from the component so the math is unit
 * testable and cannot drift between tabs.
 *
 * All inputs are structural subsets — callers pass the real Milestone /
 * Mission rows from useMissions(); the lib only reads the fields it needs.
 */

export interface MilestoneLike {
  completed: boolean;
}

export interface MissionLike {
  category: string;
  progress: number;
}

export interface CategoryStat {
  category: string;
  /** Average mission progress across missions in this category, 0-100. */
  avg: number;
  /** Number of missions contributing to this category. */
  count: number;
}

/**
 * Percentage of completed milestones (0-100, rounded). Returns 0 for an
 * empty milestone list so a fresh account shows an honest 0%, not NaN.
 */
export function computeCompletionRate(milestones: MilestoneLike[]): number {
  if (milestones.length === 0) return 0;
  const completed = milestones.filter((m) => m.completed).length;
  return Math.round((completed / milestones.length) * 100);
}

/**
 * Average mission progress grouped by category, sorted alphabetically for
 * stable rendering. Categories with zero missions are omitted.
 */
export function computeCategoryStats(missions: MissionLike[]): CategoryStat[] {
  const grouped = new Map<string, { total: number; count: number }>();
  for (const m of missions) {
    const entry = grouped.get(m.category) ?? { total: 0, count: 0 };
    entry.total += m.progress;
    entry.count += 1;
    grouped.set(m.category, entry);
  }
  return Array.from(grouped.entries())
    .map(([category, { total, count }]) => ({
      category,
      avg: Math.round(total / count),
      count,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
