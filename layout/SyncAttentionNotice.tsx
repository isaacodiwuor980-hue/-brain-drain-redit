type Props = { count:number };

/** Status only: never repost, delete or display queued content automatically. */
export function SyncAttentionNotice({count}:Props) {
  if (!Number.isSafeInteger(count) || count < 1) return null;
  return (
    <div role="status" aria-live="polite" className="relative z-20 mx-4 mt-3 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <strong>{count} sync {count === 1 ? "item needs" : "items need"} attention.</strong>{" "}
      Save status may be unknown. Keep this browser’s data and check whether the work was already saved before reposting. A recovery tool is not yet available.
    </div>
  );
}
