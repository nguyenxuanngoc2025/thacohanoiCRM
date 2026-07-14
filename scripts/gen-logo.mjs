// Vẽ logo CRM kiểu swoosh tròn (cảm hứng Firefox/Edge), tông xanh Edge hoà xanh app.
// node scripts/gen-logo.mjs  → xuất "logo app/logo.png" (1254x1254, nền trong suốt)
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'logo app', 'logo.png');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="40" y1="30" x2="480" y2="500" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0A63C9"/>
      <stop offset="0.5" stop-color="#004B9B"/>
      <stop offset="1" stop-color="#00306A"/>
    </linearGradient>
    <linearGradient id="sw" x1="360" y1="110" x2="150" y2="430" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A7ECFF"/>
      <stop offset="0.55" stop-color="#39B7F5"/>
      <stop offset="1" stop-color="#1877D4"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#001A3A" flood-opacity="0.35"/>
    </filter>
  </defs>
  <circle cx="256" cy="256" r="240" fill="url(#bg)"/>
  <path d="M351.1 142.6 A148 148 0 1 1 160.9 142.6" fill="none"
        stroke="url(#sw)" stroke-width="60" stroke-linecap="round" filter="url(#soft)"/>
  <circle cx="351.1" cy="142.6" r="36" fill="#D6F4FF"/>
</svg>`;

await sharp(Buffer.from(svg)).resize(1254, 1254).png().toFile(OUT);
console.log('Logo generated at', OUT);
