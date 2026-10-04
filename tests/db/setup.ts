// Node < 22 has no global WebSocket; supabase-js constructs a RealtimeClient eagerly.
// These tests only use REST/RPC, so an inert stub is enough.
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class {
    constructor() { throw new Error('WebSocket not available in DB tests'); }
  };
}
