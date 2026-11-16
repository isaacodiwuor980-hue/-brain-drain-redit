/**
 * Hardware and device capability utilities.
 * Provides safe wrappers around modern Web APIs: Haptic Vibration, Screen Wake Lock,
 * Web Share, Battery Status, Network Information, and Device Memory.
 */

export type HapticType = "light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error";

/**
 * Triggers hardware haptic vibration feedback on supported mobile devices.
 * Silently does nothing if the device or browser doesn't support vibration.
 */
export function triggerHaptic(type: HapticType = "light"): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return false;
  }

  try {
    switch (type) {
      case "selection":
        return navigator.vibrate(8);
      case "light":
        return navigator.vibrate(15);
      case "medium":
        return navigator.vibrate(30);
      case "heavy":
        return navigator.vibrate(50);
      case "success":
        return navigator.vibrate([15, 40, 25]);
      case "warning":
        return navigator.vibrate([30, 50, 30]);
      case "error":
        return navigator.vibrate([40, 60, 40, 60, 40]);
      default:
        return navigator.vibrate(15);
    }
  } catch {
    return false;
  }
}

/**
 * Invokes native system share sheet or falls back gracefully.
 */
export async function shareNative(data: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<{ shared: boolean; method: "native" | "clipboard" | "none" }> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return { shared: true, method: "native" };
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        return { shared: false, method: "none" };
      }
    }
  }

  // Fallback to clipboard
  if (data.url || data.text) {
    const textToCopy = [data.title, data.text, data.url].filter(Boolean).join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        return { shared: true, method: "clipboard" };
      }
    } catch {
      // Ignore clipboard failure
    }
  }

  return { shared: false, method: "none" };
}

/**
 * Device Hardware Diagnostics and Capabilities.
 */
export interface DeviceHardwareInfo {
  isMobile: boolean;
  isTouch: boolean;
  hasVibration: boolean;
  hasShare: boolean;
  hasWakeLock: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connectionType?: string;
  saveData?: boolean;
}

export function getDeviceHardwareInfo(): DeviceHardwareInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isMobile: false,
      isTouch: false,
      hasVibration: false,
      hasShare: false,
      hasWakeLock: false,
    };
  }

  const nav = navigator;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isMobile = isTouch || /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

  return {
    isMobile,
    isTouch,
    hasVibration: "vibrate" in navigator,
    hasShare: typeof navigator.share === "function",
    hasWakeLock: "wakeLock" in navigator,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    connectionType: nav.connection?.effectiveType || nav.connection?.type,
    saveData: nav.connection?.saveData,
  };
}
