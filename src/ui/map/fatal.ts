/** Only failures that leave the map unusable raise the banner; per-tile/glyph/sprite errors are transient. */
export function isFatalMapError(event: { error?: { message?: string } }, state: { styleLoaded: boolean }): boolean {
  if (!state.styleLoaded) return true;
  return /worker/i.test(event?.error?.message ?? '');
}
