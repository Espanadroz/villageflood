const ID_KEY = 'flood.device';
const NAME_KEY = 'flood.nickname';
let memoryId: string | null = null; // fallback when localStorage is blocked

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id); }
    return id;
  } catch {
    return (memoryId ??= crypto.randomUUID());
  }
}
export function getNickname(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
export function setNickname(n: string): void {
  try { localStorage.setItem(NAME_KEY, n.trim()); } catch { /* ignore */ }
}
