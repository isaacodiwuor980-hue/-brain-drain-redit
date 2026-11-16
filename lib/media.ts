/**
 * lib/media.ts — shared media helpers for story cards + the fullscreen
 * story viewer.
 *
 * Why this exists (mobile/cross-browser loading fixes):
 *
 * 1. resolveMediaUrl — story media is stored as data URLs (self-contained,
 *    IDB) or external http(s) URLs. If a relative URL ("/api/media/x") ever
 *    reaches a story, it must be resolved against the CURRENT origin, never
 *    a hardcoded localhost:127.0.0.1 — relative URLs silently break the
 *    moment the app is opened from another phone/browser via a different
 *    host (preview domains, LAN IPs).
 *
 * 2. CORS policy for media tags — deliberately NOT blanket
 *    crossOrigin="anonymous". crossOrigin changes the fetch mode: an
 *    <img>/<video> pointing at a host that doesn't send
 *    Access-Control-Allow-Origin (Firebase Storage raw URLs, some CDNs)
 *    will REFUSE TO LOAD entirely with crossOrigin set, which is exactly
 *    the "media fails on other phones" bug we're fixing. Story media here
 *    is data: URLs or plain <img> display — canvas pixel access is never
 *    needed — so we omit crossOrigin and rely on graceful onError
 *    fallbacks instead. (Supabase/Firebase storage links still display
 *    fine without it.)
 *
 * 3. referrerPolicy="no-referrer" on images — avoids hotlink-protection
 *    403s on some external CDNs when the app is embedded in the preview
 *    iframe (referrer = preview host, not the media host).
 */

/** Resolve a possibly-relative media URL against the current origin. */
export function resolveMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  // data:/blob:/http(s): are already absolute — pass through untouched.
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }
  if (typeof window === "undefined") return url;
  const origin = window.location.origin;
  return url.startsWith("/") ? `${origin}${url}` : `${origin}/${url}`;
}

/** Does this attachment represent a playable video clip? */
function attachmentIsVideo(a: {
  kind: string;
  mimeType?: string;
}): boolean {
  return a.kind === "video" || (a.mimeType?.startsWith("video/") ?? false);
}

/**
 * Find the video URL for a story, if any: explicit mediaType === "video",
 * or a video attachment (kind "video" or video/* mime).
 */
export function findStoryVideo(
  story: { mediaUrl?: string; mediaType?: string; attachments?: Array<{ kind: string; mimeType?: string; url: string }> },
): string | undefined {
  if (story.mediaType === "video" && story.mediaUrl) return story.mediaUrl;
  const videoAttachment = story.attachments?.find(attachmentIsVideo);
  if (videoAttachment?.url) return videoAttachment.url;
  return undefined;
}

/** Find the best image URL for a story (mediaUrl, else first image attachment). */
export function findStoryImage(
  story: { mediaUrl?: string; mediaType?: string; attachments?: Array<{ kind: string; mimeType?: string; url: string }> },
): string | undefined {
  if (story.mediaType !== "video" && story.mediaUrl) return story.mediaUrl;
  const image = story.attachments?.find((a) => a.kind === "image" && !attachmentIsVideo(a));
  return image?.url;
}

/**
 * Video duration in ms, clamped for the story timer: too-short clips feel
 * like a flash, too-long ones trap the viewer. [3s .. 60s].
 */
export function clampStoryVideoDuration(durationSeconds: number | undefined): number {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 5000;
  }
  return Math.min(60_000, Math.max(3_000, Math.round(durationSeconds * 1000)));
}
