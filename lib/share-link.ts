import type { Brain, Node } from "./types";

/**
 * Share links for reasoning brains.
 *
 * WHY THIS MODULE EXISTS
 * The encoder lived inline in BrainDrawer and the decoder inline in
 * ShareBrainModal. They were only accidentally compatible:
 *
 *   encode: btoa(encodeURIComponent(JSON))     // +33 % size, ASCII-only
 *   decode: decodeURIComponent(atob(hash))
 *
 * Two real consequences:
 *  1. SIZE — percent-encoding then base64 inflates the payload twice. A brain
 *     with 40 nodes (≈12 KB of JSON) produced an ~21 KB URL. Most chat apps,
 *    mail clients and QR generators may truncate long links, so shared
 *     links can arrive broken.
 *  2. FORMAT LOCK-IN — any change to one side broke every link already in the
 *     wild, because there was no version marker to fall back on.
 *
 * Now both sides share ONE implementation: UTF-8-safe base64url (avoiding
 * percent-encoding before base64, and the `+/=` characters), with
 * legacy-format decoding retained so links
 * already shared keep working.
 */

export interface SharePayload {
  brain: Brain;
  nodes: Node[];
}

/** base64url without padding — URL/hash-safe by definition. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Compact, UTF-8-safe encoding of a brain + its nodes. */
export function encodeSharePayload(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  return toBase64Url(new TextEncoder().encode(json));
}

/** Build the full shareable URL for a brain. */
export function buildShareUrl(origin: string, pathname: string, payload: SharePayload): string {
  // Always root the link at the app origin: a receiver landing on
  // /settings#share=… would otherwise get the modal over an unrelated page.
  return `${origin}/#share=${encodeSharePayload(payload)}`;
}

export type DecodeResult =
  | { ok: true; payload: SharePayload; legacy: boolean }
  | { ok: false; reason: "no-hash" | "corrupt" | "unsupported" };

/**
 * Decode a `#share=` hash. Never throws — a truncated link pasted from a chat
 * app must not cause a render-phase crash.
 */
export function decodeShareHash(hash: string): DecodeResult {
  if (!hash || !hash.startsWith("#share=")) return { ok: false, reason: "no-hash" };
  const raw = hash.slice("#share=".length).trim();
  if (!raw) return { ok: false, reason: "corrupt" };

  // 1) Current format: base64url of UTF-8 JSON.
  try {
    const json = new TextDecoder().decode(fromBase64Url(raw));
    const parsed = JSON.parse(json) as SharePayload;
    if (isValidPayload(parsed)) return { ok: true, payload: parsed, legacy: false };
  } catch {
    /* fall through to the legacy decoder */
  }

  // 2) Legacy format: btoa(encodeURIComponent(JSON)). Kept forever so links
  //    already sent keep opening.
  try {
    const json = decodeURIComponent(atob(raw));
    const parsed = JSON.parse(json) as SharePayload;
    if (isValidPayload(parsed)) return { ok: true, payload: parsed, legacy: true };
  } catch {
    return { ok: false, reason: "corrupt" };
  }

  return { ok: false, reason: "unsupported" };
}

export function isValidPayload(value: unknown): value is SharePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SharePayload>;
  return (
    !!candidate.brain &&
    typeof candidate.brain === "object" &&
    typeof candidate.brain.id === "string" &&
    candidate.brain.id.length > 0 &&
    typeof candidate.brain.title === "string" &&
    (candidate.brain.category == null || typeof candidate.brain.category === "string") &&
    (candidate.brain.description == null || typeof candidate.brain.description === "string") &&
    (candidate.brain.contributors == null || Array.isArray(candidate.brain.contributors)) &&
    (candidate.brain.source_refs == null || Array.isArray(candidate.brain.source_refs)) &&
    Array.isArray(candidate.nodes) &&
    candidate.nodes.every((node) =>
      node && typeof node === "object" && typeof node.id === "string" &&
      (node.node_type === "question" || node.node_type === "outcome")
    )
  );
}

/** Rough size guard so we can warn before producing an unusable link. */
export const SHARE_URL_WARN_LENGTH = 8000;
