export function computeServerOffset(serverTimeIso: unknown, clientNowMs: number): number {
  const t = typeof serverTimeIso === 'string' ? Date.parse(serverTimeIso) : NaN;
  const off = t - clientNowMs;
  if (!Number.isFinite(off)) throw new Error('invalid server time');
  return off;
}

/** Verified: trust the server offset. Unverified (cache only): never let the offset make data look fresher. */
export function effectiveNow(rawNowMs: number, offsetMs: number, verified: boolean): number {
  const off = Number.isFinite(offsetMs) ? offsetMs : 0;
  return verified ? rawNowMs + off : Math.max(rawNowMs, rawNowMs + off);
}
