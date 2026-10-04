import { useRef, useState } from 'react';
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from '../../core/config';
import { compressImage, isFreshCapture, readVideoDuration } from '../../lib/media';
import { InPageCamera } from './InPageCamera';

export interface Captured { blob: Blob; mediaType: string }
const MODE = import.meta.env.VITE_CAPTURE_MODE ?? 'input-capture';

export function EvidenceCapture({ required, onChange }: { required: boolean; onChange: (c: Captured | null) => void }) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; kind: 'image' | 'video' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);

  const accept = (c: Captured) => {
    setError(null);
    setPreview({ url: URL.createObjectURL(c.blob), kind: c.mediaType.startsWith('video') ? 'video' : 'image' });
    onChange(c);
  };
  const reject = (m: string) => { setError(m); setPreview(null); onChange(null); };

  async function onFile(file: File | undefined, kind: 'image' | 'video') {
    if (!file) return;
    if (!isFreshCapture(file, Date.now())) return reject('กรุณาถ่ายใหม่ในขณะนี้ ไม่ใช้รูปหรือวิดีโอจากคลังภาพ');
    try {
      if (kind === 'image') return accept({ blob: await compressImage(file), mediaType: 'image/jpeg' });
      if (file.size > MAX_VIDEO_BYTES) return reject('ไฟล์วิดีโอใหญ่เกินไป กรุณาถ่ายให้สั้นลง');
      if ((await readVideoDuration(file)) > MAX_VIDEO_SECONDS + 1) return reject(`วิดีโอยาวเกิน ${MAX_VIDEO_SECONDS} วินาที`);
      accept({ blob: file, mediaType: file.type.split(';')[0] || 'video/mp4' });
    } catch { reject('อ่านไฟล์ไม่ได้ กรุณาลองถ่ายใหม่'); }
  }

  if (camera) return <InPageCamera onCaptured={(c) => { setCamera(false); accept(c); }} onCancel={() => setCamera(false)} />;

  return (
    <div className="card">
      <strong>หลักฐาน {required ? <span className="conflict">(จำเป็น)</span> : <span>(ไม่บังคับ)</span>}</strong>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        {MODE === 'in-page' ? (
          <button type="button" onClick={() => setCamera(true)}>เปิดกล้อง</button>
        ) : (
          <>
            <button type="button" onClick={() => photoRef.current?.click()}>ถ่ายรูป</button>
            <button type="button" className="secondary" onClick={() => videoRef.current?.click()}>ถ่ายวิดีโอ</button>
          </>
        )}
      </div>
      <input ref={photoRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { onFile(e.target.files?.[0], 'image'); e.target.value = ''; }} />
      <input ref={videoRef} hidden type="file" accept="video/*" capture="environment" onChange={(e) => { onFile(e.target.files?.[0], 'video'); e.target.value = ''; }} />
      {error && <p className="conflict" role="alert">{error}</p>}
      {preview?.kind === 'image' && <img src={preview.url} alt="หลักฐาน" style={{ width: '100%', borderRadius: 8 }} />}
      {preview?.kind === 'video' && <video src={preview.url} controls playsInline style={{ width: '100%', borderRadius: 8 }} />}
    </div>
  );
}
