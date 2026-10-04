import { useCallback, useEffect, useState } from 'react';

export type Pos = { lat: number; lng: number; accuracy: number };

export function getPositionNow(timeoutMs = 8000): Promise<Pos | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: Pos | null) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator) || !navigator.geolocation) return finish(null);
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => finish(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    } catch { finish(null); }
  });
}

export function useGeolocation() {
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (!('geolocation' in navigator)) { setError('unsupported'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setError(null); },
      (e) => setError(e.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, []);
  useEffect(refresh, [refresh]);
  return { pos, error, refresh };
}
