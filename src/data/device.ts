import { newId } from '../lib/uuid';
const ID_KEY = 'flood.device';
const NAME_KEY = 'flood.nickname';
const UPLOAD_KEY = 'flood.uploadKey';
let memoryId: string | null = null; // fallback when localStorage is blocked
let memoryUploadKey: string | null = null;

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) { id = newId(); localStorage.setItem(ID_KEY, id); }
    return id;
  } catch {
    return (memoryId ??= newId());
  }
}
export function getNickname(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
export function setNickname(n: string): void {
  try { localStorage.setItem(NAME_KEY, n.trim()); } catch { /* ignore */ }
}

/** Random storage-folder key, separate from the device id: media paths are public, the device id is a credential. */
export function getUploadKey(): string {
  try {
    let k = localStorage.getItem(UPLOAD_KEY);
    if (!k) { k = newId(); localStorage.setItem(UPLOAD_KEY, k); }
    return k;
  } catch {
    return (memoryUploadKey ??= newId());
  }
}
