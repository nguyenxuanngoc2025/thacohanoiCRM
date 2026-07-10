import 'dotenv/config';
import { Zalo } from 'zca-js';
import { createDb, decrypt, maybeEnrich, runEnrichOnly, parseStyledText, fetchGroups } from './lib.mjs';

const companyId = process.argv[2];
if (!companyId) { console.error('[child] thiếu companyId'); process.exit(1); }

const {
  POLL_INTERVAL_MS = '10000', MAX_ATTEMPTS = '5',
  SEND_MIN_GAP_MS = '45000', SEND_MAX_GAP_MS = '90000',
} = process.env;
const minGap = parseInt(SEND_MIN_GAP_MS, 10);
const maxGap = parseInt(SEND_MAX_GAP_MS, 10);
const randomGap = () => minGap + Math.floor(Math.random() * Math.max(1, maxGap - minGap));
let lastSentAt = 0;
let nextGap = 0;

const db = createDb();

async function loadCred() {
  const { data, error } = await db.from('zalo_bot_sessions').select('cred_enc').eq('company_id', companyId).maybeSingle();
  if (error) throw new Error('đọc session lỗi: ' + error.message);
  if (!data?.cred_enc) throw new Error('chưa có credential');
  return JSON.parse(decrypt(data.cred_enc));
}

async function markDisconnected(msg) {
  await db.from('zalo_bot_sessions').update({
    status: 'disconnected', last_error: String(msg).slice(0, 500), updated_at: new Date().toISOString(),
  }).eq('company_id', companyId);
}

// channel_id thuộc công ty này (lọc notification để cô lập).
async function companyChannelIds() {
  const { data } = await db.from('notification_channels').select('id').eq('company_id', companyId);
  return (data ?? []).map((c) => c.id);
}

// Đích cá nhân (thread_type=0): target có thể là SĐT → tra UID Zalo qua phiên đang đăng nhập (cache).
// Nhóm (thread_type=1) hoặc target đã là UID (không giống SĐT) → giữ nguyên.
const uidCache = new Map();
const looksLikePhone = (s) => /^(\+?84|0)\d{8,10}$/.test(String(s || '').trim());
async function resolveSendTarget(api, target, threadType) {
  if (threadType !== 0 || !looksLikePhone(target)) return target;
  if (uidCache.has(target)) return uidCache.get(target);
  const local = target.startsWith('+84') ? '0' + target.slice(3) : target;
  const found = await api.findUser(local);
  const uid = found?.uid ?? found?.userId ?? found?.id ?? null;
  if (uid) uidCache.set(target, uid);
  return uid;
}

// Gửi 1 tin thật (áp nhịp chống spam). Đặt lastSentAt/nextGap sau khi xử lý.
async function processSend(api, n, max) {
  let text = n.payload?.text;
  const groupId = n.payload?.target
    ?? (await db.from('notification_channels').select('target').eq('id', n.channel_id).maybeSingle()).data?.target
    ?? null;
  if (!text || !groupId) {
    await db.from('notifications').update({
      status: 'failed', attempts: (n.attempts ?? 0) + 1,
      last_error: !text ? 'thiếu payload.text' : 'thiếu group_id',
    }).eq('id', n.id);
    return;
  }
  text = await maybeEnrich(db, api, n);
  const { msg, styles } = parseStyledText(text);
  try {
    // thread_type: 1 = nhóm (mặc định), 0 = cá nhân (cảnh báo hệ thống về Zalo cá nhân).
    const threadType = n.payload?.thread_type === 0 ? 0 : 1;
    const sendTo = await resolveSendTarget(api, groupId, threadType);
    if (!sendTo) throw new Error(`không tra được UID Zalo cho ${groupId} (SĐT chưa có Zalo / chưa kết bạn với bot)`);
    await api.sendMessage(styles.length ? { msg, styles } : { msg }, sendTo, threadType);
    await db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', n.id);
    console.log('[child]', companyId, 'gửi OK', n.id, '→', sendTo, 'type', threadType);
  } catch (e) {
    const attempts = (n.attempts ?? 0) + 1;
    await db.from('notifications').update({
      status: attempts >= max ? 'failed' : 'pending',
      attempts, last_error: String(e?.message ?? e).slice(0, 500),
    }).eq('id', n.id);
    console.error('[child]', companyId, 'gửi lỗi', n.id, e?.message);
  }
  lastSentAt = Date.now();
  nextGap = randomGap();
}

// Xử lý 1 việc tra tên độc lập (enrich_only): tra Zalo + ghi tên, KHÔNG gửi tin, KHÔNG áp nhịp gửi.
async function processEnrich(api, n, max) {
  try {
    await runEnrichOnly(db, api, n);
    await db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', n.id);
    console.log('[child]', companyId, 'tra tên OK', n.id);
  } catch (e) {
    const attempts = (n.attempts ?? 0) + 1;
    await db.from('notifications').update({
      status: attempts >= max ? 'failed' : 'pending',
      attempts, last_error: String(e?.message ?? e).slice(0, 500),
    }).eq('id', n.id);
    console.error('[child]', companyId, 'tra tên lỗi', n.id, e?.message);
  }
}

async function tick(api) {
  const ids = await companyChannelIds();
  if (!ids.length) return;
  const max = parseInt(MAX_ATTEMPTS, 10);
  const { data: pending, error } = await db
    .from('notifications')
    .select('id, channel, channel_id, payload, attempts')
    .eq('status', 'pending')
    .lt('attempts', max)
    .in('channel_id', ids)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) { console.error('[child] poll lỗi:', error.message); return; }
  const list = pending ?? [];

  // Ưu tiên gửi tin thật khi tới nhịp (real-time). Dùng thời gian NGHỈ giữa 2 tin để tra tên
  // (enrich_only) — việc nền, nhẹ, không phát tin nên không sợ spam. Mỗi tick xử lý 1 việc.
  const gapReady = Date.now() - lastSentAt >= nextGap;
  const sendTask = list.find((n) => !n.payload?.enrich_only);
  if (sendTask && gapReady) { await processSend(api, sendTask, max); return; }
  const enrichTask = list.find((n) => n.payload?.enrich_only);
  if (enrichTask) { await processEnrich(api, enrichTask, max); }
}

async function main() {
  let api;
  try {
    const cred = await loadCred();
    const zalo = new Zalo();
    api = await zalo.login(cred);
    console.log('[child]', companyId, 'đăng nhập OK');
  } catch (e) {
    console.error('[child]', companyId, 'đăng nhập lỗi:', e?.message);
    await markDisconnected(e?.message ?? 'login failed');
    process.exit(0); // exit 0 = đăng xuất chủ động, supervisor KHÔNG fork lại
  }

  // IPC: supervisor xin danh sách group → child dùng phiên sống trả về.
  process.on('message', async (m) => {
    if (m?.type === 'getGroups') {
      try {
        const groups = await fetchGroups(api);
        process.send?.({ type: 'groups', reqId: m.reqId, groups });
      } catch (e) {
        process.send?.({ type: 'groups', reqId: m.reqId, error: String(e?.message ?? e) });
      }
    }
  });

  process.send?.({ type: 'ready' });

  const interval = parseInt(POLL_INTERVAL_MS, 10);
  console.log('[child]', companyId, 'poll mỗi', interval, 'ms');
  for (;;) {
    await tick(api).catch((e) => console.error('[child] tick lỗi:', e?.message));
    await new Promise((r) => setTimeout(r, interval));
  }
}

main().catch((e) => { console.error('[child] fatal:', e); process.exit(1); });
