/**
 * Global type augmentations for browser vendor APIs and app-private window
 * state used across the client. Centralizing these here lets every module
 * use a typed reference instead of `as any` casts.
 */

interface Window {
  /** App-private flag set by forms with unsaved changes so the unload guard
   *  in layout/AppShell.tsx can warn before navigation. */
  __isAppDirty?: boolean;
}

interface BatteryManagerLike {
  level: number;
  charging: boolean;
}

interface NavigatorUADataLike {
  mobile?: boolean;
  platform?: string;
  /** Chromium high-entropy Client Hints. Returns platform/version details. */
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
  rtt?: number;
  type?: string;
}

interface DocumentPictureInPictureLike {
  requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>;
}

interface Navigator {
  /** Chrome-only battery API (deprecated spec). Guarded at runtime. */
  getBattery?: () => Promise<BatteryManagerLike>;
  /** Chromium userAgentData (Client Hints). Guarded at runtime. */
  userAgentData?: NavigatorUADataLike;
  /** Network Information API (Chrome). Guarded at runtime. */
  connection?: NetworkInformationLike;
  /** Chromium deviceMemory (approximate RAM in GB). Guarded at runtime. */
  deviceMemory?: number;
  /** Document Picture-in-Picture API (Chromium). Guarded at runtime. */
  documentPictureInPicture?: DocumentPictureInPictureLike;
}
