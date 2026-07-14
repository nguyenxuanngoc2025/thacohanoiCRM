// Sinh bộ icon PWA từ logo gốc (chạy 1 lần khi đổi logo).
// node scripts/gen-pwa-icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', 'logo app', 'logo.png');
const OUT = join(__dirname, '..', 'public');

await mkdir(OUT, { recursive: true });

// Icon chuẩn: logo phủ full khung (giữ nền trong suốt của logo).
async function plain(size, name) {
  await sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(join(OUT, name));
}

// Icon maskable: logo ~78% khung, nền trắng (Android bo tròn không cắt mất logo).
async function maskable(size, name) {
  const inner = Math.round(size * 0.78);
  const logo = await sharp(SRC).resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const pad = Math.round((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: logo, top: pad, left: pad }])
    .png().toFile(join(OUT, name));
}

// apple-touch-icon: iOS không thích nền trong suốt (thành đen) → nền trắng.
async function apple(size, name) {
  await sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#ffffff' }).png().toFile(join(OUT, name));
}

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await maskable(512, 'icon-maskable-512.png');
await apple(180, 'apple-touch-icon.png');
await plain(32, 'favicon.png');
console.log('PWA icons generated in', OUT);
