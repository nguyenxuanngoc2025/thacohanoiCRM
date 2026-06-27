/**
 * Backfill model_id cho lead có model_id IS NULL — dò dòng xe theo brand, single-match.
 * CHỈ ghi cột model_id. KHÔNG đụng status/assign. KHÔNG gửi Zalo. Idempotent (chạy lại an toàn).
 *
 * Chạy:   node scripts/backfill-detect-model.mjs          (ghi thật)
 *         node scripts/backfill-detect-model.mjs --dry     (chỉ in báo cáo, không ghi)
 * Đọc env từ .env.production.local | .env.local | .env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
function loadEnv(file) {
  try {
    for (const line of readFileSync(join(__dir, '..', file), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv('.env.production.local');
loadEnv('.env.local');
loadEnv('.env');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Thiếu SUPABASE env (URL / SERVICE_ROLE_KEY)'); process.exit(1); }

const db = createClient(url, key, { db: { schema: 'crm_thacoauto' }, auth: { persistSession: false } });

function normalize(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function detect(brandId, text, models) {
  const hay = normalize(text);
  if (!hay) return null;
  const hit = [];
  for (const m of models) {
    if (!m.is_active || m.brand_id !== brandId) continue;
    const keys = [m.name, ...(m.keywords ?? [])].map(normalize).filter((k) => k.length > 0);
    if (keys.some((k) => hay.includes(k))) hit.push(m.id);
  }
  return hit.length === 1 ? hit[0] : null;
}
function payloadText(p) {
  if (!p) return '';
  const parts = [];
  const fd = p.field_data;
  if (Array.isArray(fd)) for (const f of fd) for (const v of (f.values ?? [])) if (v) parts.push(v);
  if (typeof p.message === 'string') parts.push(p.message);
  if (typeof p.text === 'string') parts.push(p.text);
  if (p.message && typeof p.message.text === 'string') parts.push(p.message.text);
  if (p.form_name) parts.push(p.form_name);
  if (p.ad_name) parts.push(p.ad_name);
  return parts.join(' ');
}

const { data: models } = await db.from('models').select('id,brand_id,name,keywords,is_active');
const { data: leads } = await db.from('leads')
  .select('id,brand_id,full_name,external_payload,model_id')
  .is('model_id', null);

const nameById = Object.fromEntries((models ?? []).map((m) => [m.id, m.name]));
let total = 0, classified = 0, blank = 0;
const dist = {};
const updates = [];

for (const lead of leads ?? []) {
  total++;
  const text = [payloadText(lead.external_payload), lead.full_name ?? ''].join(' ');
  const mid = lead.brand_id ? detect(lead.brand_id, text, models ?? []) : null;
  if (mid) {
    classified++;
    dist[nameById[mid] ?? mid] = (dist[nameById[mid] ?? mid] ?? 0) + 1;
    updates.push({ id: lead.id, model_id: mid });
  } else {
    blank++;
  }
}

const DRY = process.argv.includes('--dry');
if (!DRY) {
  for (const u of updates) {
    await db.from('leads').update({ model_id: u.model_id }).eq('id', u.id);
  }
}

console.log('=== BÁO CÁO BACKFILL DÒ DÒNG XE ===');
console.log(`Chế độ: ${DRY ? 'DRY-RUN (không ghi)' : 'ĐÃ GHI model_id'}`);
console.log(`Tổng lead xét (model_id null): ${total}`);
console.log(`Phân loại được: ${classified}`);
console.log(`Để trống (mơ hồ/không trúng): ${blank}`);
console.log('Phân bố theo dòng xe:');
for (const [name, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name}: ${n}`);
}
