import 'dotenv/config';
import fs from 'node:fs';
import { createDb, encrypt } from './lib.mjs';

// Chạy 1 lần trên VPS: mã hoá zalo-cred.json hiện có → INSERT/UPSERT zalo_bot_sessions cho công ty HN.
// Dùng: COMPANY_ID=<uuid_hn> node migrate-hn-session.mjs
const companyId = process.env.COMPANY_ID;
const credPath = process.env.ZALO_CRED_PATH || './zalo-cred.json';
if (!companyId) { console.error('Thiếu COMPANY_ID'); process.exit(1); }
if (!fs.existsSync(credPath)) { console.error('Không thấy file cred:', credPath); process.exit(1); }

const db = createDb();
const cred = fs.readFileSync(credPath, 'utf8'); // JSON string
const blob = encrypt(cred);

const { error } = await db.from('zalo_bot_sessions').upsert({
  company_id: companyId,
  cred_enc: blob,
  display_name: process.env.DISPLAY_NAME || 'Thaco Auto Hà Nội',
  status: 'connected',
  connected_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
if (error) { console.error('UPSERT lỗi:', error.message); process.exit(1); }
console.log('OK — đã lưu phiên bot cho công ty', companyId);
process.exit(0);
