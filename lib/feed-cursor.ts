/** A feed keyset cursor is ordering metadata, not proof of visibility or access. */
export interface FeedCursor { createdAt: string; id: string }

/** Narrow PostgREST-safe timestamp syntax, preserving database microseconds.
 * Reject invalid calendar dates and timezone offsets rather than normalizing them. */
export function isFeedCursorTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return false;
  const [,year,month,day,hour,minute,second,,zone] = m;
  const y=Number(year), mo=Number(month), d=Number(day), h=Number(hour), min=Number(minute), sec=Number(second);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > days[mo-1] || h > 23 || min > 59 || sec > 59) return false;
  if (zone !== "Z") {
    const zh=Number(zone.slice(1,3)), zm=Number(zone.slice(4,6));
    if (zh > 14 || zm > 59 || (zh === 14 && zm !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}
export function isFeedCursor(value: unknown): value is FeedCursor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const cursor=value as Partial<FeedCursor>;
  return typeof cursor.id === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(cursor.id) && isFeedCursorTimestamp(cursor.createdAt);
}
