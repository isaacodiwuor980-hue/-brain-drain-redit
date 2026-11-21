/** Display untrusted story HTML or text as literal text, never as markup. */
export function StorySafeText({ text }: { text?: string }) {
  return <pre className="whitespace-pre-wrap break-words text-xs mt-2">{text}</pre>;
}
