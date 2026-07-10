import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Giá trị enum TextStyle của zca-js (string ổn định). Khai báo cục bộ để file này
// test được bằng vitest mà KHÔNG cần zca-js cài trong node_modules của app.
const TextStyle = { Bold: 'b', Italic: 'i' };

// --- Crypto: AES-256-GCM, định dạng base64url(iv).base64url(tag).base64url(ct) ---
function getKey() {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw) throw new Error('TOKEN_ENC_KEY chưa được cấu hình');
  return createHash('sha256').update(raw).digest();
}
export function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}
export function decrypt(blob) {
  const [ivB64, tagB64, dataB64] = String(blob).split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Chuỗi mã hoá không hợp lệ');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

// --- Supabase service client (schema crm_thacoauto) ---
export function createDb() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SCHEMA = 'crm_thacoauto' } = process.env;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: SUPABASE_SCHEMA },
    auth: { persistSession: false },
  });
}

// --- Tên Zalo: chọn field tên đầu tiên có giá trị ---
export function pickZaloName(u) {
  if (!u) return null;
  const cand = u.display_name || u.zalo_name || u.displayName || u.username || u.name;
  const s = (typeof cand === 'string' ? cand : '').trim();
  return s || null;
}

/**
 * Lõi tra tên Zalo cho 1 lead: tra SĐT → nếu có tên thì ghi vào lead (trừ khi user đã khoá tên
 * name_locked, hoặc tên hiện tại không còn là badName). Luôn đóng dấu name_enriched_at sau khi THỬ
 * (kể cả SĐT không có Zalo) để job quét không tra lại lead đó vô hạn. Trả tên Zalo tra được (hoặc null).
 */
async function enrichLeadName(db, api, e, { auto = false } = {}) {
  const localPhone = e.phone.startsWith('+84') ? '0' + e.phone.slice(3) : e.phone;
  const nowIso = new Date().toISOString();
  try {
    const found = await api.findUser(localPhone);
    const zaloName = pickZaloName(found);
    const { data: lead } = await db.from('leads')
      .select('full_name, name_locked').eq('id', e.leadId).maybeSingle();
    if (zaloName) {
      // Chỉ ghi đè khi user CHƯA khoá tên và tên hiện tại vẫn là tên rác (badName/trống).
      if (lead && !lead.name_locked && (lead.full_name === e.badName || !lead.full_name?.trim())) {
        await db.from('leads').update({ full_name: zaloName, name_enriched_at: nowIso }).eq('id', e.leadId);
        await db.from('lead_logs').insert({ lead_id: e.leadId, type: 'system',
          content: `Bù tên từ Zalo${auto ? ' (quét tự động)' : ''}: ${e.badName} → ${zaloName}` });
      } else {
        await db.from('leads').update({ name_enriched_at: nowIso }).eq('id', e.leadId);
      }
      return zaloName;
    }
    await db.from('leads').update({ name_enriched_at: nowIso }).eq('id', e.leadId);
    await db.from('lead_logs').insert({ lead_id: e.leadId, type: 'system', content: 'SĐT không có Zalo / tên ẩn — giữ tên gốc.' });
  } catch (err) {
    console.error('[zca] findUser lỗi', e.leadId, err?.message);
  }
  return null;
}

// --- Bù tên Zalo cho lead tên rác (payload.enrich) TRƯỚC khi gửi ---
export async function maybeEnrich(db, api, n) {
  let text = n.payload?.text;
  const e = n.payload?.enrich;
  if (!e?.phone || !e?.leadId || !e?.badName) return text;
  const zaloName = await enrichLeadName(db, api, e);
  if (zaloName) text = text.replace(e.badName, zaloName);
  return text;
}

// --- Việc tra tên độc lập (payload.enrich_only, do cron xếp): CHỈ tra + ghi tên, KHÔNG gửi tin ---
export async function runEnrichOnly(db, api, n) {
  const e = n.payload?.enrich;
  if (!e?.phone || !e?.leadId || !e?.badName) return;
  await enrichLeadName(db, api, e, { auto: true });
}

// --- Đổi tag <b>/<i> → styles Zalo. Offset theo độ dài chuỗi JS. Chạy SAU maybeEnrich. ---
const STYLE_TAGS = { '<b>': { close: '</b>', st: TextStyle.Bold }, '<i>': { close: '</i>', st: TextStyle.Italic } };
export function parseStyledText(input) {
  if (!input) return { msg: input ?? '', styles: [] };
  let msg = '';
  const styles = [];
  let i = 0;
  while (i < input.length) {
    const open = input.startsWith('<b>', i) ? '<b>' : input.startsWith('<i>', i) ? '<i>' : null;
    if (open) {
      const { close, st } = STYLE_TAGS[open];
      const end = input.indexOf(close, i + open.length);
      if (end === -1) { msg += input[i++]; continue; }
      const inner = input.slice(i + open.length, end);
      if (inner) styles.push({ start: msg.length, len: inner.length, st });
      msg += inner;
      i = end + close.length;
    } else {
      msg += input[i++];
    }
  }
  return { msg, styles };
}

// --- Trích danh sách group id từ kết quả getAllGroups (shape đổi theo phiên bản zca-js) ---
export function extractGroupIds(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res.map(String).filter(Boolean);
  for (const b of [res.gridVerMap, res.gridInfoMap]) {
    if (b && typeof b === 'object' && !Array.isArray(b)) return Object.keys(b);
  }
  for (const b of [res.groups, res.data]) {
    if (Array.isArray(b)) {
      return b.map((x) => String(typeof x === 'object' && x ? (x.groupId ?? x.id ?? '') : x)).filter(Boolean);
    }
  }
  return Object.keys(res).filter((k) => /^\d+$/.test(k));
}

// --- Lấy [{id,name}] cho tất cả group con bot đang ở trong ---
export async function fetchGroups(api) {
  const all = await api.getAllGroups();
  const ids = extractGroupIds(all);
  if (!ids.length) return [];
  let map = {};
  try {
    const info = await api.getGroupInfo(ids);
    map = info?.gridInfoMap ?? info ?? {};
  } catch (e) {
    console.error('[zca] getGroupInfo lỗi', e?.message);
  }
  return ids.map((id) => ({ id, name: map[id]?.name ?? map[id]?.groupName ?? id }));
}
