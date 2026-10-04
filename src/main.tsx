import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ui/styles.css';
import { DISCLAIMER_TH } from './core/config';

function showFatal(root: HTMLElement) {
  root.textContent = '';
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'font-family:sans-serif;padding:24px;max-width:480px;margin:0 auto';
  const msg = document.createElement('p');
  msg.textContent = 'ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ — กรุณาแจ้งผู้ดูแล';
  const note = document.createElement('p');
  note.textContent = DISCLAIMER_TH;
  box.append(msg, note);
  root.append(box);
}

async function bootstrap() {
  const root = document.getElementById('root')!;
  try {
    const { App } = await import('./ui/App');
    createRoot(root).render(<App />);
  } catch (e) {
    console.error(e);
    showFatal(root);
  }
}

void bootstrap();
