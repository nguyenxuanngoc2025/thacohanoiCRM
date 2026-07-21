/**
 * Gộp lead trùng khách cũ (chạy 1 lần) + chuẩn hoá SĐT còn lại về +84.
 *
 * Trùng = cùng (company_id, chuẩn-hoá(phone), brand_id). Gốc: một số lead lưu SĐT dạng "0..."
 * (nhập tay/import bỏ chuẩn hoá) nên ràng buộc duy nhất không bắt được → tách thành nhiều dòng.
 *
 * Dòng chính mỗi nhóm: phân loại cao nhất → có TVBH đang chăm → tạo sớm nhất.
 * Bù thông tin trống của dòng chính từ dòng phụ (full_name/model_id/b10_status/b10_care_note/last_note),
 * KHÔNG hạ phân loại, KHÔNG đổi TVBH/showroom/phòng. Chuyển lead_logs dòng phụ → dòng chính. Xoá dòng phụ.
 * Sau đó UPDATE mọi SĐT còn "0..." về "+84..." (an toàn vì đã hết trùng).
 *
 * Chạy:  node scripts/merge-dup-leads.mjs           (dry — chỉ in báo cáo, KHÔNG ghi)
 *        node scripts/merge-dup-leads.mjs --apply    (ghi thật, có backup JSON trước)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

const APPLY = process.argv.includes('--apply');
const db = createClient(url, key, { db: { schema: 'crm_thacoauto' }, auth: { persistSession: false } });

// Chuẩn hoá SĐT — KHỚP CHÍNH XÁC src/lib/phone.ts normalizePhone.
function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/[^\d+]/g, '');
  let local;
  if (digits.startsWith('+84')) local = digits.slice(3);
  else if (digits.startsWith('84')) local = digits.slice(2);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else local = digits.replace(/^\+/, '');
  if (!/^\d{9}$/.test(local)) return null;
  return '+84' + local;
}

const STATUS_RANK = { 'KHĐ': 5, GDTD: 4, KHQT: 3, Fail: 2, 'Chưa LH được': 1 };
const rank = (s) => (s && STATUS_RANK[s]) || 0;
const isEmpty = (v) => v === null || v === undefined || String(v).trim() === '';

async function fetchAllLeads() {
  const cols = 'id, company_id, phone, brand_id, status, assigned_to, sales_team_id, showroom_id, full_name, model_id, b10_status, b10_care_note, last_note, created_at';
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('leads').select(cols)
      .order('created_at', { ascending: true }).range(from, from + PAGE - 1);
    if (error) { console.error('Lỗi đọc leads:', error.message); process.exit(1); }
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Chọn dòng chính: rank cao nhất → có assigned_to → created_at sớm nhất.
function pickMaster(group) {
  return [...group].sort((a, b) => {
    const rd = rank(b.status) - rank(a.status);
    if (rd) return rd;
    const ad = (b.assigned_to ? 1 : 0) - (a.assigned_to ? 1 : 0);
    if (ad) return ad;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
}

const FILL_FIELDS = ['full_name', 'model_id', 'b10_status', 'b10_care_note', 'last_note'];

async function main() {
  const leads = await fetchAllLeads();
  console.log(`Tổng lead: ${leads.length}`);

  // Gom nhóm theo (company_id, canonical phone, brand_id)
  const groups = new Map();
  let nonNormalizable = 0;
  let zeroFormat = 0;
  for (const l of leads) {
    const canon = normalizePhone(l.phone);
    if (!canon) nonNormalizable++;
    if (l.phone && l.phone.startsWith('0')) zeroFormat++;
    const kphone = canon ?? `RAW:${l.phone}`;
    const gk = `${l.company_id}|${kphone}|${l.brand_id}`;
    const arr = groups.get(gk) ?? [];
    arr.push(l);
    groups.set(gk, arr);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length >= 2);
  const dupLeadCount = dupGroups.reduce((s, g) => s + g.length, 0);
  console.log(`SĐT dạng 0...: ${zeroFormat} | SĐT không chuẩn hoá được: ${nonNormalizable}`);
  console.log(`Nhóm trùng (≥2): ${dupGroups.length} | Tổng lead trong nhóm trùng: ${dupLeadCount}`);
  console.log(`→ Sau gộp giảm: ${dupLeadCount - dupGroups.length} dòng\n`);

  // In vài nhóm mẫu
  for (const g of dupGroups.slice(0, 5)) {
    const m = pickMaster(g);
    console.log(`Nhóm SĐT ${g[0].phone} (brand ${g[0].brand_id?.slice(0, 8)}): ${g.length} dòng`);
    for (const l of g) {
      console.log(`   ${l.id === m.id ? '★' : ' '} ${l.id.slice(0, 8)} status=${l.status ?? '—'} tvbh=${l.assigned_to ? l.assigned_to.slice(0, 8) : '—'} name=${l.full_name ?? '—'} ${l.created_at?.slice(0, 10)}`);
    }
  }

  if (!APPLY) {
    console.log('\n[DRY] Không ghi gì. Chạy lại với --apply để gộp thật.');
    return;
  }

  // ---- BACKUP ----
  const masterIds = dupGroups.map((g) => pickMaster(g).id);
  const allDupIds = dupGroups.flatMap((g) => g.map((l) => l.id));
  const { data: logsBackup } = await db.from('lead_logs').select('*').in('lead_id', allDupIds);
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const backupDir = join(__dir, '..', 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `dup-leads-${ts}.json`);
  writeFileSync(backupPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    dupGroups: dupGroups.map((g) => ({ masterId: pickMaster(g).id, rows: g })),
    leadLogs: logsBackup ?? [],
  }, null, 2), 'utf8');
  console.log(`\nBackup: ${backupPath} (${dupGroups.length} nhóm, ${(logsBackup ?? []).length} log)`);

  // ---- GỘP TỪNG NHÓM ----
  let merged = 0, deleted = 0;
  for (const g of dupGroups) {
    const master = pickMaster(g);
    const dups = g.filter((l) => l.id !== master.id);
    const dupIds = dups.map((l) => l.id);

    // Bù thông tin trống của dòng chính từ dòng phụ (ưu tiên dòng rank cao trước).
    const donors = [...dups].sort((a, b) => rank(b.status) - rank(a.status));
    const patch = {};
    for (const f of FILL_FIELDS) {
      if (!isEmpty(master[f])) continue;
      const donor = donors.find((d) => !isEmpty(d[f]));
      if (donor) patch[f] = donor[f];
    }
    if (Object.keys(patch).length) {
      const { error } = await db.from('leads').update(patch).eq('id', master.id);
      if (error) { console.error(`  Lỗi bù ${master.id}:`, error.message); continue; }
    }

    // Chuyển lead_logs dòng phụ → dòng chính.
    if (dupIds.length) {
      const { error } = await db.from('lead_logs').update({ lead_id: master.id }).in('lead_id', dupIds);
      if (error) { console.error(`  Lỗi chuyển log ${master.id}:`, error.message); continue; }
    }

    // Ghi log gộp.
    await db.from('lead_logs').insert({
      lead_id: master.id, type: 'system',
      content: `Gộp khách cũ hỏi lại (${g.length} lần) — dồn từ ${dups.length} dòng trùng.`,
    });

    // Xoá dòng phụ (notifications của chúng cascade tự dọn).
    const { error: delErr } = await db.from('leads').delete().in('id', dupIds);
    if (delErr) { console.error(`  Lỗi xoá phụ ${master.id}:`, delErr.message); continue; }

    merged++; deleted += dupIds.length;
  }
  console.log(`Đã gộp ${merged} nhóm, xoá ${deleted} dòng phụ.`);

  // ---- CHUẨN HOÁ SĐT CÒN LẠI ----
  const after = await fetchAllLeads();
  let fixed = 0;
  for (const l of after) {
    const canon = normalizePhone(l.phone);
    if (canon && canon !== l.phone) {
      const { error } = await db.from('leads').update({ phone: canon }).eq('id', l.id);
      if (error) { console.error(`  Lỗi chuẩn hoá ${l.id}:`, error.message); continue; }
      fixed++;
    }
  }
  console.log(`Chuẩn hoá SĐT: ${fixed} dòng "0..." → "+84...".`);

  // ---- VERIFY ----
  const check = await fetchAllLeads();
  const gmap = new Map();
  for (const l of check) {
    const gk = `${l.company_id}|${normalizePhone(l.phone) ?? l.phone}|${l.brand_id}`;
    gmap.set(gk, (gmap.get(gk) ?? 0) + 1);
  }
  const stillDup = [...gmap.values()].filter((n) => n >= 2).length;
  console.log(`\nVERIFY: tổng lead = ${check.length} | nhóm trùng còn lại = ${stillDup} (kỳ vọng 0).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
