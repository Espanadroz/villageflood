// Used when VITE_CAPTURE_MODE=in-page (Task 1 decision)
import { useEffect, useRef, useState } from 'react';
import { MAX_VIDEO_SECONDS } from '../../core/config';
import type { Captured } from './EvidenceCapture';

export function InPageCamera({ onCaptured, onCancel }: { onCaptured: (c: Captured) => void; onCancel: () => void }) {
  const videoEl = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: true });
        videoEl.current!.srcObject = stream.current;
        await videoEl.current!.play();
      } catch { setError('เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์'); }
    })();
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const snap = () => {
    const v = videoEl.current!;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCaptured({ blob: b, mediaType: 'image/jpeg' }), 'image/jpeg', 0.8);
  };
  const start = () => {
    if (!stream.current || typeof MediaRecorder === 'undefined') return setError('อุปกรณ์นี้อัดวิดีโอในหน้าเว็บไม่ได้ กรุณาใช้ถ่ายรูป');
    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    const rec = new MediaRecorder(stream.current, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => onCaptured({ blob: new Blob(chunks.current, { type: mime }), mediaType: mime });
    rec.start();
    recorder.current = rec;
    setRecording(true);
    setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_VIDEO_SECONDS * 1000);
  };
  const stop = () => { recorder.current?.state === 'recording' && recorder.current.stop(); setRecording(false); };

  return (
    <div className="card">
      <video ref={videoEl} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
      {error && <p className="conflict" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {!recording && <button type="button" onClick={snap}>ถ่ายรูป</button>}
        {!recording ? <button type="button" className="secondary" onClick={start}>อัดวิดีโอ (สูงสุด {MAX_VIDEO_SECONDS} วินาที)</button>
                    : <button type="button" onClick={stop}>หยุดอัด</button>}
        <button type="button" className="secondary" onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  );
}
