import { useEffect, useState } from 'react';
import { idbKV } from '../data/kv';
import { createOutbox } from '../data/outbox';
import { sendItem } from '../data/submit';

export const outbox = createOutbox({ store: idbKV(), send: sendItem });

export function useOutboxCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = async () => setN((await outbox.pending()).length);
    refresh();
    const t = setInterval(refresh, 5000);
    const flush = () => outbox.flush().then(refresh);
    flush();
    window.addEventListener('online', flush);
    return () => { clearInterval(t); window.removeEventListener('online', flush); };
  }, []);
  return n;
}
