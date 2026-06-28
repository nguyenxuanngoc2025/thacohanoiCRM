import 'dotenv/config';
import http from 'node:http';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Zalo } from 'zca-js';
import { createDb, encrypt, pickZaloName } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHILD_PATH = path.join(__dirname, 'child.mjs');

const {
  ZALO_GATEWAY_PORT = '8787',
  ZALO_GATEWAY_SECRET,
} = process.env;

const db = createDb();

// companyId → { proc, ready }
const children = new Map();
// companyId → { zalo, status:'pending'|'connected'|'error', qr, error, displayName }
const logins = new Map();
// reqId → { resolve, reject, timer }
const groupReqs = new Map();
// companyId muốn dừng có chủ đích (logout) — đừng fork lại
const intentionalStop = new Set();

function forkChild(companyId) {
  if (children.has(companyId)) return;
  const proc = fork(CHILD_PATH, [companyId], { env: process.env });
  const entry = { proc, ready: false };
  children.set(companyId, entry);

  proc.on('message', (m) => {
    if (m?.type === 'ready') { entry.ready = true; }
    else if (m?.type === 'groups') {
      const r = groupReqs.get(m.reqId);
      if (r) { clearTimeout(r.timer); groupReqs.delete(m.reqId); m.error ? r.reject(new Error(m.error)) : r.resolve(m.groups ?? []); }
    }
  });

  proc.on('exit', (code) => {
    children.delete(companyId);
    if (intentionalStop.has(companyId)) { intentionalStop.delete(companyId); return; }
    if (code === 0) return; // child tự đánh dấu disconnected → không fork lại
    console.error('[sup]', companyId, 'child crash code', code, '→ fork lại sau 5s');
    setTimeout(() => forkChild(companyId), 5000);
  });
  console.log('[sup] fork child', companyId);
}

async function startupForkAll() {
  const { data, error } = await db.from('zalo_bot_sessions').select('company_id').eq('status', 'connected');
  if (error) { console.error('[sup] đọc sessions lỗi:', error.message); return; }
  for (const r of data ?? []) forkChild(r.company_id);
}

// --- Bắt đầu đăng nhập QR cho 1 công ty; trả promise resolve khi có ảnh QR đầu tiên ---
function startLogin(companyId) {
  // Đã có phiên login đang chờ → trả lại QR hiện tại.
  const existing = logins.get(companyId);
  if (existing && existing.status === 'pending' && existing.qr) return Promise.resolve(existing.qr);

  const zalo = new Zalo();
  const state = { zalo, status: 'pending', qr: null, error: null, displayName: null };
  logins.set(companyId, state);

  return new Promise((resolve) => {
    let resolved = false;
    zalo.loginQR(undefined, (qrData) => {
      const img = qrData?.data?.image;
      if (img && !resolved) {
        state.qr = img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
        resolved = true;
        resolve(state.qr);
      }
    }).then(async (api) => {
      // Quét thành công → lưu cred mã hoá + tên, fork child.
      try {
        const ctx = api.getContext?.() ?? {};
        const me = await api.fetchAccountInfo?.().catch(() => null);
        const displayName = pickZaloName(me?.profile ?? me) ?? 'Tài khoản Zalo';
        const zaloUid = String(ctx?.uid ?? me?.profile?.userId ?? me?.userId ?? '') || null;
        await db.from('zalo_bot_sessions').upsert({
          company_id: companyId,
          zalo_uid: zaloUid,
          display_name: displayName,
          cred_enc: encrypt(JSON.stringify(ctx)),
          status: 'connected',
          last_error: null,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        state.status = 'connected';
        state.displayName = displayName;
        forkChild(companyId);
      } catch (e) {
        state.status = 'error';
        state.error = String(e?.message ?? e);
      }
      if (!resolved) { resolved = true; resolve(state.qr); }
    }).catch((e) => {
      state.status = 'error';
      state.error = String(e?.message ?? e);
      if (!resolved) { resolved = true; resolve(null); }
    });
  });
}

function requestGroups(companyId) {
  const entry = children.get(companyId);
  if (!entry || !entry.ready) return Promise.reject({ code: 409, message: 'Chưa kết nối Zalo cho công ty này' });
  const reqId = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { groupReqs.delete(reqId); reject({ code: 504, message: 'Hết thời gian chờ danh sách group' }); }, 10000);
    groupReqs.set(reqId, { resolve, reject, timer });
    entry.proc.send({ type: 'getGroups', reqId });
  });
}

async function logout(companyId) {
  const entry = children.get(companyId);
  if (entry) { intentionalStop.add(companyId); entry.proc.kill(); }
  logins.delete(companyId);
  await db.from('zalo_bot_sessions').update({
    status: 'disconnected', cred_enc: null, last_error: null, updated_at: new Date().toISOString(),
  }).eq('company_id', companyId);
}

// --- HTTP gateway (chỉ localhost + secret) ---
function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  if (req.headers['x-gateway-secret'] !== ZALO_GATEWAY_SECRET) return json(res, 401, { error: 'unauthorized' });
  const url = new URL(req.url, 'http://127.0.0.1');
  const cid = url.searchParams.get('companyId');
  try {
    if (req.method === 'POST' && url.pathname === '/login/start') {
      const { companyId } = await readJson(req);
      if (!companyId) return json(res, 400, { error: 'thiếu companyId' });
      const qr = await startLogin(companyId);
      if (!qr) return json(res, 500, { error: logins.get(companyId)?.error ?? 'không tạo được QR' });
      return json(res, 200, { qr });
    }
    if (req.method === 'GET' && url.pathname === '/login/status') {
      if (!cid) return json(res, 400, { error: 'thiếu companyId' });
      const s = logins.get(cid);
      if (s) return json(res, 200, { status: s.status, zaloName: s.displayName, error: s.error });
      // Không có phiên login đang chờ → tra DB.
      const { data } = await db.from('zalo_bot_sessions').select('status, display_name, last_error').eq('company_id', cid).maybeSingle();
      return json(res, 200, { status: data?.status === 'connected' ? 'connected' : 'disconnected', zaloName: data?.display_name, error: data?.last_error });
    }
    if (req.method === 'GET' && url.pathname === '/groups') {
      if (!cid) return json(res, 400, { error: 'thiếu companyId' });
      const groups = await requestGroups(cid);
      return json(res, 200, { groups });
    }
    if (req.method === 'POST' && url.pathname === '/logout') {
      const { companyId } = await readJson(req);
      if (!companyId) return json(res, 400, { error: 'thiếu companyId' });
      await logout(companyId);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, e?.code ?? 500, { error: e?.message ?? 'server error' });
  }
});

server.listen(parseInt(ZALO_GATEWAY_PORT, 10), '127.0.0.1', () => {
  console.log('[sup] gateway lắng nghe 127.0.0.1:' + ZALO_GATEWAY_PORT);
});

startupForkAll();
