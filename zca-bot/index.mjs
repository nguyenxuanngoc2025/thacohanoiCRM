import 'dotenv/config';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Zalo } from 'zca-js';

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SCHEMA = 'crm_thacoauto',
  POLL_INTERVAL_MS = '10000', MAX_ATTEMPTS = '5',
  ZALO_CRED_PATH = './zalo-cred.json',
} = process.env;

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
  const api = await zalo.loginQR(undefined, (qrData) => {
    console.log('[zca-bot] QUÉT QR ĐĂNG NHẬP (mở log, dùng app Zalo quét):');
    if (qrData?.data?.image) console.log('QR base64:', qrData.data.image.slice(0, 60), '...(xem README để render)');
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

async function tick(api) {
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
    const text = n.payload?.text;
    const groupId = await resolveTarget(n);
    if (!text || !groupId) {
      await db.from('notifications').update({
        status: 'failed', attempts: (n.attempts ?? 0) + 1,
        last_error: !text ? 'thiếu payload.text' : 'thiếu group_id',
      }).eq('id', n.id);
      continue;
    }
    try {
      await api.sendMessage({ msg: text }, groupId, 1); // 1 = ThreadType.Group
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
