import type { ReportKind } from './types';

/** Mirrors SQL function requires_evidence() in supabase/migrations/0002_rpc.sql — keep in sync. */
export function requiresEvidence(kind: ReportKind, value: string): boolean {
  if (kind === 'road') return value !== 'impassable';
  if (kind === 'water_level') return true;
  return false;
}
