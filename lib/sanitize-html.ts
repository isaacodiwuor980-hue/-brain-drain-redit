/**
 * lib/sanitize-html.ts — allowlist sanitizer for user-supplied HTML.
 *
 * ROOT-CAUSE FIX (B2 — stored XSS): note-post HTML attachments were rendered
 * with `dangerouslySetInnerHTML={{ __html: att.data }}` and NO sanitization,
 * while PostCreator actively invites raw HTML (`placeholder="<div>…</div>"`).
 * Attachments are persisted server-side and served to every viewer via
 * /api/feed — a single malicious note could execute script in every reader's
 * session (stored XSS).
 *
 * Strategy: parse in an inert DOMParser document (scripts never execute
 * there), then rebuild the node set from an ALLOWLIST — everything not
 * explicitly allowed is removed entirely (scriptable embeds) or unwrapped
 * (unknown containers keep their text children). Event-handler attributes,
 * inline styles, and non-safe URLs are stripped; links are forced to
 * `target=_blank rel="noopener noreferrer nofollow"`.
 *
 * This is defense at the RENDER boundary: it protects against legacy rows
 * already in the database, not just future submissions.
 */

/** Elements dropped together with their entire subtree. */
const REMOVE_ENTIRELY = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "APPLET", "LINK", "META",
  "BASE", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION",
  "NOSCRIPT", "TEMPLATE", "SLOT", "SVG", "MATH", "AUDIO", "VIDEO", "SOURCE",
  "TRACK", "CANVAS", "DIALOG",
]);

/** Elements kept after attribute scrubbing; anything else is unwrapped. */
const ALLOWED_TAGS = new Set([
  "P", "DIV", "SPAN", "BR", "HR", "WBR",
  "B", "STRONG", "I", "EM", "U", "S", "SUB", "SUP", "MARK", "SMALL", "ABBR",
  "UL", "OL", "LI", "A", "IMG", "BLOCKQUOTE", "PRE", "CODE", "KBD",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "CAPTION",
  "FIGURE", "FIGCAPTION", "DETAILS", "SUMMARY",
]);

/** Attributes kept on any allowed element. */
const ALLOWED_ATTRS = new Set([
  "class", "title", "alt", "dir", "lang", "width", "height",
  "colspan", "rowspan", "start", "reversed", "datetime", "cite", "summary",
]);

const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * URL allowlist for href/src-style attributes. Blocks javascript:, data:text/*,
 * vbscript:, and protocol-relative off-site tricks; allows http(s), mailto,
 * same-origin relative paths, and inline raster images.
 */
function safeUrl(raw: string): string | null {
  const value = raw.trim();
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^data:image\/(png|jpe?g|gif|webp|bmp|avif);/i.test(value)) return value;
  return null;
}

function cleanElement(el: Element): void {
  // Depth-first: children are cleaned before the parent is kept or unwrapped.
  for (const child of Array.from(el.children)) cleanElement(child);

  const tag = el.tagName;

  // 1. Scriptable/dangerous elements go away with their entire subtree.
  if (REMOVE_ENTIRELY.has(tag)) {
    el.remove();
    return;
  }

  // 2. Attribute scrubbing.
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || name === "style") {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === "href" || name === "src" || name === "srcset" || name === "xlink:href" || name === "poster" || name === "background") {
      const safe = safeUrl(attr.value);
      if (safe === null) el.removeAttribute(attr.name);
      else el.setAttribute(attr.name, safe);
      continue;
    }
    if (!ALLOWED_ATTRS.has(name)) el.removeAttribute(attr.name);
  }

  // 3. Harden links.
  if (tag === "A") {
    if (!el.hasAttribute("href")) el.removeAttribute("target");
    else {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }

  // 4. Unknown tags: unwrap (keep the already-cleaned children).
  if (!ALLOWED_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
    }
  }
}

/**
 * Sanitize an untrusted HTML fragment for safe innerHTML rendering.
 * Falls back to full text-escaping in non-DOM environments (unit tests run
 * in a node environment; the browser always has DOMParser).
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return escapeText(dirty);
  }
  const doc = new DOMParser().parseFromString(dirty, "text/html");

  // Comments are inert but can carry legacy conditional-comment payloads —
  // strip them so the output contains only whitelisted markup.
  const comments: Comment[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  let current = walker.nextNode();
  while (current) {
    comments.push(current as Comment);
    current = walker.nextNode();
  }
  for (const comment of comments) comment.remove();

  for (const child of Array.from(doc.body.children)) cleanElement(child);

  return doc.body.innerHTML;
}
