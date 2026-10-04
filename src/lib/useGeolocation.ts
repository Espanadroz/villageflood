import { useCallback, useEffect, useState } from 'react';

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
