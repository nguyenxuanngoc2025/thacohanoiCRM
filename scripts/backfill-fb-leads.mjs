/**
 * Backfill lead từ các Lead Ads form của fanpage về CRM (1 lần).
 * - Lấy lead có time_created >= SINCE (mặc định 2026-06-01) từ tất cả form đang có lead.
 * - Tất cả → thương hiệu Tải Bus (channel mặc định). Chia showroom 2 cấp (ít lead nhất, có TVBH).
 * - Idempotent: bỏ qua nếu trùng fb_lead_id hoặc trùng (phone, brand_id).
 *
 * Chạy:  node scripts/backfill-fb-leads.mjs [YYYY-MM-DD]
 * Đọc env từ app/.env.local (FB_SYSTEM_USER_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- env ----
const env = {};
for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.FB_SYSTEM_USER_TOKEN;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const V = env.FB_GRAPH_VERSION || 'v21.0';
const PAGE_ID = '433432613872953';
const CHANNEL_ID = '4359f3c5-e620-41e8-8966-38a2c07de022';
const BRAND_TAIBUS = 'e2f64d29-d337-411d-a8be-f745816c1d99';
const SHOWROOMS = [
  'a4e38658-fc57-4179-805d-0cd68dd8de5c', // Đài Tư
  '597e3a58-d864-4bf6-b04d-c50aa11adaf6', // Chương Mỹ
  'c19bc127-f021-4970-9c50-96edce0a38af', // Giải Phóng
];
const SINCE = process.argv[2] || '2026-06-01';
const SINCE_UNIX = Math.floor(new Date(SINCE + 'T00:00:00+07:00').getTime() / 1000);

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'crm_thacoauto' },
});

// ---- helpers (đồng bộ với src/lib) ----
function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/[^\d+]/g, '');
  let local;
  if (digits.startsWith('+84')) local = digits.slice(3);
  else if (digits.startsWith('84')) local = digits.slice(2);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else local = digits.replace(/^\+/, '');
  if (!/^\d{9,10}$/.test(local)) return null;
  return '+84' + local;
}
function extractPhone(text) {
  if (!text) return null;
  const re = /(?:\+?84|0)\d(?:[\s.\-]?\d){7,9}/g;
  for (const m of String(text).match(re) || []) {
    const p = normalizePhone(m);
    if (p) return p;
  }
  return null;
}
function pickLeastLoaded(arr) {
  if (!arr.length) return null;
  return [...arr].sort((a, b) => a.count !== b.count ? a.count - b.count : a.id.localeCompare(b.id))[0].id;
}

async function fb(path, params = {}) {
  const qs = new URLSearchParams({ access_token: TOKEN, ...params });
  const r = await fetch(`https://graph.facebook.com/${V}/${path}?${qs}`);
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.message}`);
  return j;
}

// trích phone + tên từ field_data
function parseLead(fieldData) {
  let phone = null, name = null;
  for (const f of fieldData || []) {
    const key = (f.name || '').toLowerCase();
    const val = (f.values || [])[0] || '';
    if (!phone && /phone|sđt|sdt|so_?dien|số_?điện|dien_?thoai|điện_?thoại|mobile/.test(key)) phone = normalizePhone(val);
    if (!name && /name|tên|ten|họ|ho_?ten|họ_?và_?tên|full/.test(key)) name = val;
  }
  if (!phone) for (const f of fieldData || []) { phone = extractPhone((f.values || [])[0]); if (phone) break; }
  return { phone, name };
}

async function main() {
  console.log(`Backfill lead form từ ${SINCE} (unix ${SINCE_UNIX})`);

  // page token + company + sla
  const pt = (await fb(`${PAGE_ID}`, { fields: 'access_token' })).access_token;
  const { data: sr } = await db.from('showrooms').select('company_id').eq('id', SHOWROOMS[2]).single();
  const companyId = sr.company_id;
  const { data: sla } = await db.from('sla_config').select('first_response_hours').eq('company_id', companyId).eq('round', 1).eq('is_active', true).maybeSingle();

  // TVBH active theo showroom (để chia 2 cấp)
  const { data: tvbhAll } = await db.from('users').select('id, showroom_id').in('showroom_id', SHOWROOMS).eq('role', 'tvbh').eq('is_active', true);
  const tvbhBy = new Map();
  for (const t of tvbhAll || []) { const a = tvbhBy.get(t.showroom_id) || []; a.push(t.id); tvbhBy.set(t.showroom_id, a); }

  // forms
  const forms = [];
  let next = `${PAGE_ID}/leadgen_forms`, params = { fields: 'id,name,leads_count', limit: '100', access_token: pt };
  let url = `https://graph.facebook.com/${V}/${next}?${new URLSearchParams(params)}`;
  while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) throw new Error('forms: ' + j.error.message);
    forms.push(...(j.data || []).filter((f) => (f.leads_count || 0) > 0));
    url = j.paging?.next || null;
  }
  console.log(`Form có lead: ${forms.length}`);

  let imported = 0, deduped = 0, noPhone = 0, total = 0;
  for (const form of forms) {
    let lurl = `https://graph.facebook.com/${V}/${form.id}/leads?` + new URLSearchParams({
      access_token: pt, limit: '100',
      fields: 'id,created_time,field_data',
      filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: SINCE_UNIX }]),
    });
    while (lurl) {
      const j = await (await fetch(lurl)).json();
      if (j.error) { console.log(`  ! form ${form.name}: ${j.error.message}`); break; }
      for (const lead of j.data || []) {
        total++;
        const { phone, name } = parseLead(lead.field_data);
        if (!phone) { noPhone++; continue; }

        // idempotent: trùng fb_lead_id?
        const { data: byId } = await db.from('leads').select('id').eq('fb_lead_id', lead.id).maybeSingle();
        if (byId) { deduped++; continue; }
        // trùng (phone, brand)?
        const { data: byPhone } = await db.from('leads').select('id').eq('phone', phone).eq('brand_id', BRAND_TAIBUS).maybeSingle();
        if (byPhone) { deduped++; continue; }

        // chia showroom 2 cấp
        const withTvbh = SHOWROOMS.filter((s) => (tvbhBy.get(s) || []).length > 0);
        const pool = withTvbh.length ? withTvbh : SHOWROOMS;
        const loads = [];
        for (const s of pool) {
          const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('showroom_id', s).or('status.is.null,status.neq.Fail');
          loads.push({ id: s, count: count || 0 });
        }
        const showroomId = pickLeastLoaded(loads) || SHOWROOMS[0];

        // TVBH ít lead nhất trong showroom (hiện chưa có → null)
        let assignedTo = null;
        const tvbhIds = tvbhBy.get(showroomId) || [];
        if (tvbhIds.length) {
          const tl = [];
          for (const id of tvbhIds) {
            const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', id).or('status.is.null,status.neq.Fail');
            tl.push({ id, count: count || 0 });
          }
          assignedTo = pickLeastLoaded(tl);
        }

        const nextContactAt = sla ? new Date(Date.now() + sla.first_response_hours * 3600 * 1000).toISOString() : null;
        const { error } = await db.from('leads').insert({
          company_id: companyId,
          showroom_id: showroomId,
          brand_id: BRAND_TAIBUS,
          channel_account_id: CHANNEL_ID,
          assigned_to: assignedTo,
          phone,
          phone_raw: phone,
          full_name: name,
          source: 'facebook',
          status: null,
          round: 1,
          next_contact_at: nextContactAt,
          fb_lead_id: lead.id,
          created_at: lead.created_time,
          external_payload: { form_id: form.id, form_name: form.name, field_data: lead.field_data },
        });
        if (error) { console.log(`  ! insert lỗi: ${error.message}`); continue; }
        imported++;
      }
      lurl = j.paging?.next || null;
    }
    console.log(`  ${form.name}: xong (tổng quét ${total}, nhập ${imported})`);
  }

  console.log(`\n=== KẾT QUẢ ===`);
  console.log(`Tổng lead quét (từ ${SINCE}): ${total}`);
  console.log(`Đã nhập mới: ${imported}`);
  console.log(`Trùng (bỏ qua): ${deduped}`);
  console.log(`Không có SĐT (bỏ qua): ${noPhone}`);
}

main().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
