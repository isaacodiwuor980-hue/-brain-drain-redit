import { openDB } from "./db";

// Browser-wide (not account-wide); this does not control cloud records,
// other tracking services, or data already sent to the server.
const KEY = "local-analytics-control-v1";
export const LOCAL_ANALYTICS_CHANGE = "brain-builder-local-analytics-change";
interface Control { enabled: boolean; epoch: number }
function readControl(value: unknown): Control {
  if (value === undefined) return { enabled: true, epoch: 0 }; // preserve legacy behavior
  if (value && typeof value === "object" && "enabled" in value && "epoch" in value && typeof value.enabled === "boolean" && typeof value.epoch === "number" && Number.isSafeInteger(value.epoch) && value.epoch >= 0) return { enabled: value.enabled, epoch: value.epoch };
  return { enabled: false, epoch: 0 }; // fail closed on corrupt settings
}
// Honor the old saved-off preference even though older versions did not
// enforce it. Missing legacy settings retain the previous default (on).
function loadControl(store: IDBObjectStore, done: (control: Control) => void) {
  const req = store.get(KEY);
  req.onsuccess = () => {
    if (req.result !== undefined) { done(readControl(req.result)); return; }
    const legacy = store.get("privacy-settings");
    legacy.onsuccess = () => done(legacy.result?.dataCollection === false ? { enabled: false, epoch: 0 } : { enabled: true, epoch: 0 });
  };
}
function changed() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCAL_ANALYTICS_CHANGE));
  try { localStorage.setItem(LOCAL_ANALYTICS_CHANGE, `${Date.now()}-${Math.random()}`); } catch { /* Other tabs will check storage before writes. */ }
}
export async function getLocalAnalyticsControl(): Promise<Control> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readonly");
    let control: Control = { enabled: false, epoch: 0 };
    loadControl(tx.objectStore("settings"), value => { control = value; });
    tx.oncomplete = () => resolve(control);
    tx.onerror = () => reject(tx.error ?? new Error("Could not read activity preference"));
    tx.onabort = () => reject(tx.error ?? new Error("Could not read activity preference"));
  });
}
export async function setLocalAnalyticsEnabled(enabled: boolean): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["settings", "analytics_events"], "readwrite");
    const store = tx.objectStore("settings");
    loadControl(store, current => { store.put({ id: KEY, enabled, epoch: current.epoch + (current.enabled === enabled ? 0 : 1) }); });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error("Could not save activity preference")); tx.onabort = () => reject(tx.error ?? new Error("Could not save activity preference"));
  });
  changed();
}
export async function clearLocalAnalytics(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["settings", "analytics_events"], "readwrite");
    const store = tx.objectStore("settings");
    loadControl(store, current => { store.put({ id: KEY, enabled: current.enabled, epoch: current.epoch + 1 }); tx.objectStore("analytics_events").clear(); });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error("Could not clear activity")); tx.onabort = () => reject(tx.error ?? new Error("Could not clear activity"));
  });
  changed();
}
export async function recordLocalAnalytics<T extends { id: string }>(event: T): Promise<number | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let epoch: number | null = null;
    const tx = db.transaction(["settings", "analytics_events"], "readwrite");
    loadControl(tx.objectStore("settings"), control => { if (control.enabled) { epoch = control.epoch; tx.objectStore("analytics_events").put(event); } });
    tx.oncomplete = () => resolve(epoch); tx.onerror = () => reject(tx.error ?? new Error("Could not save activity")); tx.onabort = () => reject(tx.error ?? new Error("Could not save activity"));
  });
}
export async function getVisibleAnalyticsEvents<T>(): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let values: T[] = [];
    const tx = db.transaction(["settings", "analytics_events"], "readonly");
    loadControl(tx.objectStore("settings"), control => { if (control.enabled) { const req = tx.objectStore("analytics_events").getAll(); req.onsuccess = () => { values = req.result as T[]; }; } });
    tx.oncomplete = () => resolve(values); tx.onerror = () => reject(tx.error ?? new Error("Could not read activity")); tx.onabort = () => reject(tx.error ?? new Error("Could not read activity"));
  });
}
