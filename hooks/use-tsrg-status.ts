import { useEffect, useState } from "react";
import { env } from "../lib/env";

// This is a soft kill switch for cooperating online clients only. Offline and
// older app versions may still use local ranking. It is NOT an absolute kill
// switch or an authorization control. Polling and background timer delays mean
// an operator change is not observed instantly.
export function useTsrgStatus(enabled: boolean): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    // Reset stale permission as soon as the optional check is disabled.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled || !env.apiEnabled) { setAvailable(false); return; }
    let active = true;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let sequence = 0;
    const check = () => {
      const current = ++sequence;
      controller?.abort();
      if (timeout) clearTimeout(timeout);
      setAvailable(false);
      controller = new AbortController();
      const localController = controller;
      timeout = setTimeout(() => {
        localController.abort();
        if (active && current === sequence) {
          sequence++; setAvailable(false);
          console.warn({ event: "tsrg_status_checked", available: false, reason: "timeout" });
        }
      }, 3000);
      void fetch(`${env.apiBaseUrl}/api/tsrg/status`, { signal: localController.signal, cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("unavailable");
          const data: unknown = await response.json();
          const ok = typeof data === "object" && data !== null && "experimental_feed_available" in data && data.experimental_feed_available === true && "scope" in data && data.scope === "online-clients-only";
          if (active && current === sequence) {
            setAvailable(ok);
            console.warn({ event: "tsrg_status_checked", available: ok, reason: ok ? "enabled" : "disabled_or_invalid" });
          }
        })
        .catch(() => {
          if (active && current === sequence) {
            setAvailable(false);
            console.warn({ event: "tsrg_status_checked", available: false, reason: "unavailable" });
          }
        })
        .finally(() => { if (current === sequence && timeout) clearTimeout(timeout); });
    };
    const offline = () => { sequence++; controller?.abort(); if (timeout) clearTimeout(timeout); setAvailable(false); };
    check();
    const interval = setInterval(check, 30_000);
    window.addEventListener("offline", offline);
    window.addEventListener("online", check);
    return () => { active = false; sequence++; controller?.abort(); if (timeout) clearTimeout(timeout); clearInterval(interval); window.removeEventListener("offline", offline); window.removeEventListener("online", check); };
  }, [enabled]);
  return enabled && available;
}
