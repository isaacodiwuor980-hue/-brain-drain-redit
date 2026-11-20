/** The story store is local-only; limit attachments to avoid exhausting quota. */
export const STORY_FILE_LIMIT = 1024 * 1024;
export const STORY_TEXT_LIMIT = 10_000;
export function safeStoryLink(input: string): string | null {
  try {
    const url = new URL(input.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function storyFileKind(file: Pick<File, "name" | "type" | "size">): "image" | "file" | "html" {
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > STORY_FILE_LIMIT) throw new Error("Choose a non-empty file up to 1 MB.");
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) return "image";
  if (file.type === "application/pdf" || (file.type === "" && /\.pdf$/i.test(file.name))) return "file";
  if (file.type === "text/html" || (file.type === "" && /\.html?$/i.test(file.name))) return "html";
  throw new Error("Choose a JPG, PNG, GIF, WebP, PDF or HTML file.");
}
