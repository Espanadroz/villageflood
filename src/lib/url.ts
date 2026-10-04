/** Returns the URL only if it is an absolute http(s) URL; anything else (javascript:, data:, relative, garbage) is null. */
export function safeHttpUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? u : null;
  } catch { return null; }
}
