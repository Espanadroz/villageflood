import { idbKV } from '../data/kv';
import { createOutbox } from '../data/outbox';
import { sendItem } from '../data/submit';

export const outbox = createOutbox({ store: idbKV(), send: sendItem });
