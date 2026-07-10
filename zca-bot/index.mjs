import 'dotenv/config';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Zalo, TextStyle } from 'zca-js';

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SCHEMA = 'crm_thacoauto',
  POLL_INTERVAL_MS = '10000', MAX_ATTEMPTS = '5',
  ZALO_CRED_PATH = './zalo-cred.json',
  // Giãn nhịp gửi để tránh Zalo gắn cờ spam (gửi tối đa 1 tin / nhịp ngẫu nhiên).
  SEND_MIN_GAP_MS = '45000', SEND_MAX_GAP_MS = '90000',
} = process.env;

const minGap = parseInt(SEND_MIN_GAP_MS, 10);
const maxGap = parseInt(SEND_MAX_GAP_MS, 10);
const randomGap = () => minGap + Math.floor(Math.random() * Math.max(1, maxGap - minGap));
let lastSentAt = 0;       // mốc lần gửi Zalo thật gần nhất
let nextGap = 0;          // khoảng cách tới lần gửi kế (0 = gửi ngay khi rảnh)

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: SUPABASE_SCHEMA },
  auth: { persistSession: false },
});

// --- Đăng nhập Zalo: dùng cred đã lưu nếu có, không thì quét QR ---
async function login() {
  const zalo = new Zalo();
  if (fs.existsSync(ZALO_CRED_PATH)) {
    try {
      const cred = JSON.parse(fs.readFileSync(ZALO_CRED_PATH, 'utf8'));
      const api = await zalo.login(cred);
      console.log('[zca-bot] Đăng nhập bằng credential đã lưu.');
      return api;
    } catch (e) {
      console.warn('[zca-bot] Cred cũ hỏng, quét QR lại:', e.message);
    }
  }
  const qrPath = process.env.ZALO_QR_PATH || './qr.png';
  const api = await zalo.loginQR(undefined, (qrData) => {
    const img = qrData?.data?.image;
    if (img) {
      const b64 = img.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(qrPath, Buffer.from(b64, 'base64'));
      console.log(`[zca-bot] ĐÃ LƯU MÃ QR: ${qrPath} — mở file này quét bằng app Zalo của tài khoản bot.`);
    } else {
      console.log('[zca-bot] QR event (chưa có image):', JSON.stringify(qrData).slice(0, 200));
    }
  });
  try {
    const ctx = api.getContext?.();
    if (ctx) fs.writeFileSync(ZALO_CRED_PATH, JSON.stringify(ctx));
  } catch { /* tuỳ phiên bản zca-js */ }
  console.log('[zca-bot] Đăng nhập QR xong.');
  return api;
}

// --- Lấy group_id: ưu tiên payload.target, fallback join channel_id ---
async function resolveTarget(n) {
  if (n.payload?.target) return n.payload.target;
  if (!n.channel_id) return null;
  const { data } = await db.from('notification_channels').select('target').eq('id', n.channel_id).maybeSingle();
  return data?.target ?? null;
}

// Lead tên rác (payload.enrich) → tra Zalo bù tên TRƯỚC khi gửi.
// Trả về text (đã thay tên nếu tra được), luôn an toàn — lỗi thì giữ text gốc.
function pickZaloName(u) {
  if (!u) return null;
  const cand = u.display_name || u.zalo_name || u.displayName || u.username || u.name;
  const s = (typeof cand === 'string' ? cand : '').trim();
  return s || null;
}

async function maybeEnrich(api, n) {
  let text = n.payload?.text;
  const e = n.payload?.enrich;
  if (!e?.phone || !e?.leadId || !e?.badName) return text;

  // +84... → 0... (Zalo nhận SĐT nội địa)
  const localPhone = e.phone.startsWith('+84') ? '0' + e.phone.slice(3) : e.phone;
  try {
    const found = await api.findUser(localPhone);
    const zaloName = pickZaloName(found);
    if (zaloName) {
      // Ghi đè khi tên DB vẫn là tên rác (== badName) HOẶC còn trống (null/rỗng) — vì badName
      // mặc định là 'Khách lẻ' khi DB lưu null, nên null cũng là trường hợp an toàn để bù tên.
      // (Tránh đè tên người vừa sửa tay: chỉ đè khi chưa có tên thật.)
      const { data: lead } = await db.from('leads').select('full_name').eq('id', e.leadId).maybeSingle();
      if (lead && (lead.full_name === e.badName || !lead.full_name?.trim())) {
        await db.from('leads').update({ full_name: zaloName }).eq('id', e.leadId);
        await db.from('lead_logs').insert({
          lead_id: e.leadId, type: 'system',
          content: `Bù tên từ Zalo: ${e.badName} → ${zaloName}`,
        });
      }
      text = text.replace(e.badName, zaloName);
      console.log('[zca-bot] bù tên Zalo', e.leadId, e.badName, '→', zaloName);
    } else {
      await db.from('lead_logs').insert({
        lead_id: e.leadId, type: 'system', content: 'SĐT không có Zalo / tên ẩn — giữ tên gốc.',
      });
      console.log('[zca-bot] không tra được tên Zalo', e.leadId, localPhone);
    }
  } catch (err) {
    console.error('[zca-bot] findUser lỗi', e.leadId, err?.message);
  }
  return text;
}

// Đổi tag <b>...</b> → ĐẬM, <i>...</i> → NGHIÊNG của Zalo. Trả về { msg sạch, styles[] }.
// Dùng tag (không phải **...**) để KHÔNG đụng dấu * trong SĐT che (vd 0901234*** → 3 dấu *).
// Offset (start/len) tính theo độ dài chuỗi JS — đúng cách Zalo đếm vị trí ký tự.
// Phải chạy SAU maybeEnrich để offset khớp text cuối (sau khi bù tên).
const STYLE_TAGS = { '<b>': { close: '</b>', st: TextStyle.Bold }, '<i>': { close: '</i>', st: TextStyle.Italic } };
function parseStyledText(input) {
  if (!input) return { msg: input ?? '', styles: [] };
  let msg = '';
  const styles = [];
  let i = 0;
  while (i < input.length) {
    const open = input.startsWith('<b>', i) ? '<b>' : input.startsWith('<i>', i) ? '<i>' : null;
    if (open) {
      const { close, st } = STYLE_TAGS[open];
      const end = input.indexOf(close, i + open.length);
      if (end === -1) { msg += input[i++]; continue; } // tag lẻ → giữ nguyên ký tự
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

async function tick(api) {
  // Chưa tới nhịp gửi kế → bỏ qua tick này (giãn nhịp chống spam).
  if (Date.now() - lastSentAt < nextGap) return;

  const max = parseInt(MAX_ATTEMPTS, 10);
  const { data: pending, error } = await db
    .from('notifications')
    .select('id, channel, channel_id, payload, attempts')
    .eq('status', 'pending')
    .lt('attempts', max)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) { console.error('[zca-bot] poll lỗi:', error.message); return; }

  for (const n of pending ?? []) {
    let text = n.payload?.text;
    const groupId = await resolveTarget(n);
    if (!text || !groupId) {
      // Lỗi dữ liệu → đánh dấu ngay, KHÔNG tính vào nhịp gửi Zalo.
      await db.from('notifications').update({
        status: 'failed', attempts: (n.attempts ?? 0) + 1,
        last_error: !text ? 'thiếu payload.text' : 'thiếu group_id',
      }).eq('id', n.id);
      continue;
    }
    // Bù tên Zalo nếu là tin new_lead có enrich (tra trước, gửi tên thật).
    text = await maybeEnrich(api, n);
    // Đổi marker **đậm** → style đậm Zalo (sau bù tên để offset khớp text cuối).
    const { msg, styles } = parseStyledText(text);
    try {
      // thread_type: 1 = nhóm (mặc định), 0 = cá nhân (cảnh báo hệ thống gửi Zalo cá nhân).
      const threadType = n.payload?.thread_type === 0 ? 0 : 1;
      await api.sendMessage(styles.length ? { msg, styles } : { msg }, groupId, threadType);
      await db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', n.id);
      console.log('[zca-bot] gửi OK', n.id, '→', groupId);
    } catch (e) {
      const attempts = (n.attempts ?? 0) + 1;
      await db.from('notifications').update({
        status: attempts >= max ? 'failed' : 'pending',
        attempts, last_error: String(e?.message ?? e).slice(0, 500),
      }).eq('id', n.id);
      console.error('[zca-bot] gửi lỗi', n.id, e?.message);
    }
    // Đã thực hiện 1 lần gửi Zalo (thành/bại) → đặt nhịp mới rồi dừng tick.
    lastSentAt = Date.now();
    nextGap = randomGap();
    break;
  }
}

async function main() {
  const api = await login();
  const interval = parseInt(POLL_INTERVAL_MS, 10);
  console.log('[zca-bot] bắt đầu poll mỗi', interval, 'ms');
  // vòng lặp tuần tự, tránh chồng tick
  for (;;) {
    await tick(api).catch((e) => console.error('[zca-bot] tick lỗi:', e?.message));
    await new Promise((r) => setTimeout(r, interval));
  }
}

main().catch((e) => { console.error('[zca-bot] fatal:', e); process.exit(1); });
