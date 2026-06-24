/**
 * Quét lead từ TIN NHẮN (Messenger) + BÌNH LUẬN (comment) của fanpage (1 lần).
 * - Tin nhắn KH chứa SĐT  → source 'fb_message' (chi tiết kênh: Tin nhắn).
 * - Bình luận KH chứa SĐT → source 'fb_comment' (chi tiết kênh: Bình luận).
 * - Tất cả → thương hiệu Tải Bus. Chia đều 3 showroom 2 cấp (như Lead Ads).
 * - Idempotent: bỏ qua nếu trùng fb_lead_id (conversation id / comment id) hoặc trùng (phone, brand_id).
 *
 * Chạy:  node scripts/backfill-fb-engagement.mjs [YYYY-MM-DD]
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
const SINCE_MS = new Date(SINCE + 'T00:00:00+07:00').getTime();
const POST_CUTOFF_MS = SINCE_MS - 90 * 86400 * 1000; // quét comment trên bài cũ hơn tối đa 90 ngày

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
  return [...arr].sort((a, b) => (a.count !== b.count ? a.count - b.count : a.id.localeCompare(b.id)))[0].id;
}

async function fbUrl(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

// ---- ngữ cảnh chung (page token + company + sla + tvbh) ----
let PT, companyId, sla, tvbhBy;
async function setup() {
  PT = (await fbUrl(`https://graph.facebook.com/${V}/${PAGE_ID}?fields=access_token&access_token=${TOKEN}`)).access_token;
  const { data: sr } = await db.from('showrooms').select('company_id').eq('id', SHOWROOMS[2]).single();
  companyId = sr.company_id;
  const { data: slaRow } = await db.from('sla_config').select('first_response_hours')
    .eq('company_id', companyId).eq('round', 1).eq('is_active', true).maybeSingle();
  sla = slaRow;
  const { data: tvbhAll } = await db.from('users').select('id, showroom_id')
    .in('showroom_id', SHOWROOMS).eq('role', 'tvbh').eq('is_active', true);
  tvbhBy = new Map();
  for (const t of tvbhAll || []) { const a = tvbhBy.get(t.showroom_id) || []; a.push(t.id); tvbhBy.set(t.showroom_id, a); }
}

// ---- nạp 1 lead (dedup + chia đều 2 cấp + insert) ----
async function insertLead({ phone, name, source, fbId, createdTime }) {
  // idempotent: trùng fb_lead_id?
  const { data: byId } = await db.from('leads').select('id').eq('fb_lead_id', fbId).maybeSingle();
  if (byId) return 'dup';
  // trùng (phone, brand)?
  const { data: byPhone } = await db.from('leads').select('id').eq('phone', phone).eq('brand_id', BRAND_TAIBUS).maybeSingle();
  if (byPhone) return 'dup';

  // CẤP 1 — chọn showroom ít lead đang mở nhất (lead chưa Fail, kể cả status NULL)
  const withTvbh = SHOWROOMS.filter((s) => (tvbhBy.get(s) || []).length > 0);
  const pool = withTvbh.length ? withTvbh : SHOWROOMS;
  const loads = [];
  for (const s of pool) {
    const { count } = await db.from('leads').select('id', { count: 'exact', head: true })
      .eq('showroom_id', s).or('status.is.null,status.neq.Fail');
    loads.push({ id: s, count: count || 0 });
  }
  const showroomId = pickLeastLoaded(loads) || SHOWROOMS[0];

  // CẤP 2 — TVBH ít lead nhất trong showroom (hiện chưa có → null)
  let assignedTo = null;
  const tvbhIds = tvbhBy.get(showroomId) || [];
  if (tvbhIds.length) {
    const tl = [];
    for (const id of tvbhIds) {
      const { count } = await db.from('leads').select('id', { count: 'exact', head: true })
        .eq('assigned_to', id).or('status.is.null,status.neq.Fail');
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
    source,
    status: null,
    round: 1,
    next_contact_at: nextContactAt,
    fb_lead_id: fbId,
    created_at: createdTime,
  });
  if (error) { console.log(`  ! insert lỗi: ${error.message}`); return 'err'; }
  return 'new';
}

// ---- quét BÌNH LUẬN ----
async function scanComments() {
  let imported = 0, scanned = 0;
  let postsUrl = `https://graph.facebook.com/${V}/${PAGE_ID}/feed?` + new URLSearchParams({
    fields: 'id,created_time', limit: '50', access_token: PT,
  });
  let stop = false;
  while (postsUrl && !stop) {
    const j = await fbUrl(postsUrl);
    for (const post of j.data || []) {
      if (new Date(post.created_time).getTime() < POST_CUTOFF_MS) { stop = true; break; }
      let cUrl = `https://graph.facebook.com/${V}/${post.id}/comments?` + new URLSearchParams({
        fields: 'id,message,from,created_time', limit: '100', filter: 'stream', access_token: PT,
      });
      while (cUrl) {
        let cj;
        try { cj = await fbUrl(cUrl); } catch { break; }
        for (const c of cj.data || []) {
          if (c.from && c.from.id === PAGE_ID) continue; // bỏ comment của chính page
          if (new Date(c.created_time).getTime() < SINCE_MS) continue;
          const phone = extractPhone(c.message);
          if (!phone) continue;
          scanned++;
          const res = await insertLead({
            phone, name: c.from?.name || null, source: 'fb_comment',
            fbId: c.id, createdTime: c.created_time,
          });
          if (res === 'new') imported++;
        }
        cUrl = cj.paging?.next || null;
      }
    }
    postsUrl = stop ? null : (j.paging?.next || null);
  }
  console.log(`Bình luận: có SĐT ${scanned}, nhập mới ${imported}`);
  return imported;
}

// ---- quét TIN NHẮN ----
async function scanMessages() {
  let imported = 0, scanned = 0;
  let convUrl = `https://graph.facebook.com/${V}/${PAGE_ID}/conversations?` + new URLSearchParams({
    fields: 'id,updated_time', limit: '100', access_token: PT,
  });
  let stop = false;
  while (convUrl && !stop) {
    const j = await fbUrl(convUrl);
    for (const conv of j.data || []) {
      if (new Date(conv.updated_time).getTime() < SINCE_MS) { stop = true; break; }
      // tên KH = participant không phải page
      let custName = null;
      try {
        const p = await fbUrl(`https://graph.facebook.com/${V}/${conv.id}?fields=participants&access_token=${PT}`);
        const other = (p.participants?.data || []).find((x) => x.id !== PAGE_ID);
        custName = other?.name || null;
      } catch { /* ignore */ }

      // tìm tin nhắn KH đầu tiên (trong cửa sổ) có SĐT
      let mUrl = `https://graph.facebook.com/${V}/${conv.id}/messages?` + new URLSearchParams({
        fields: 'id,message,from,created_time', limit: '100', access_token: PT,
      });
      let found = null;
      while (mUrl && !found) {
        let mj;
        try { mj = await fbUrl(mUrl); } catch { break; }
        for (const m of mj.data || []) {
          if (m.from && m.from.id === PAGE_ID) continue; // tin của page
          if (new Date(m.created_time).getTime() < SINCE_MS) continue;
          const phone = extractPhone(m.message);
          if (phone) { found = { phone, createdTime: m.created_time }; break; }
        }
        mUrl = found ? null : (mj.paging?.next || null);
      }
      if (!found) continue;
      scanned++;
      const res = await insertLead({
        phone: found.phone, name: custName, source: 'fb_message',
        fbId: conv.id, createdTime: found.createdTime,
      });
      if (res === 'new') imported++;
    }
    convUrl = stop ? null : (j.paging?.next || null);
  }
  console.log(`Tin nhắn: có SĐT ${scanned}, nhập mới ${imported}`);
  return imported;
}

async function main() {
  console.log(`Quét cmt + tin nhắn từ ${SINCE} (page ${PAGE_ID})`);
  await setup();
  const c = await scanComments();
  const m = await scanMessages();
  console.log(`\n=== KẾT QUẢ ===`);
  console.log(`Bình luận nhập mới: ${c}`);
  console.log(`Tin nhắn nhập mới: ${m}`);
  console.log(`Tổng nhập mới: ${c + m}`);
}

main().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
