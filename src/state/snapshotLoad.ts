export const FETCH_TIMEOUT_MS = 20_000;
export const TIMEOUT_MESSAGE_TH = 'โหลดข้อมูลนานเกินไป — อินเทอร์เน็ตอาจช้า กรุณาลองใหม่';

/** Reject with a Thai-friendly error if `p` has not settled within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, message = TIMEOUT_MESSAGE_TH): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Sequence guard: a response is applied only if it comes from a newer request than the last applied one. */
export function createLatestGate() {
  let issued = 0;
  let applied = 0;
  return {
    begin: (): number => ++issued,
    shouldApply(seq: number): boolean {
      if (seq <= applied) return false;
      applied = seq;
      return true;
    },
  };
}
