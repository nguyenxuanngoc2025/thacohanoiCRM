import 'dotenv/config';
import fs from 'node:fs';
import { Zalo } from 'zca-js';

// Liệt kê các nhóm Zalo mà tài khoản bot là thành viên → in tên + group_id.
// Chạy SAU khi đã đăng nhập (có zalo-cred.json) và đã thêm bot vào các nhóm.
// Dùng: `node list-groups.mjs`  rồi dán group_id vào Cài đặt > Kênh thông báo.

const { ZALO_CRED_PATH = './zalo-cred.json' } = process.env;

async function login() {
  const zalo = new Zalo();
  if (fs.existsSync(ZALO_CRED_PATH)) {
    const cred = JSON.parse(fs.readFileSync(ZALO_CRED_PATH, 'utf8'));
    return zalo.login(cred);
  }
  throw new Error('Chưa có zalo-cred.json — chạy index.mjs quét QR đăng nhập trước.');
}

function extractGroupIds(res) {
  // zca-js đổi shape theo phiên bản: gom mọi key dạng id từ các map thường gặp.
  const ids = new Set();
  const maps = [res?.gridVerMap, res?.gridInfoMap, res?.groups, res];
  for (const m of maps) {
    if (m && typeof m === 'object') for (const k of Object.keys(m)) if (/^\d+$/.test(k)) ids.add(k);
  }
  if (Array.isArray(res)) for (const x of res) if (/^\d+$/.test(String(x))) ids.add(String(x));
  return [...ids];
}

async function main() {
  const api = await login();
  const all = await api.getAllGroups();
  const ids = extractGroupIds(all);
  if (ids.length === 0) {
    console.log('Không thấy nhóm nào. Bảo đảm tài khoản bot đã được THÊM vào nhóm trước.');
    console.log('Raw getAllGroups():', JSON.stringify(all).slice(0, 800));
    return;
  }
  let infoMap = {};
  try {
    const info = await api.getGroupInfo(ids);
    infoMap = info?.gridInfoMap ?? info ?? {};
  } catch (e) {
    console.warn('Không lấy được tên nhóm (vẫn in id):', e?.message);
  }
  console.log(`\n=== ${ids.length} nhóm ===`);
  for (const id of ids) {
    const name = infoMap?.[id]?.name ?? infoMap?.[id]?.groupName ?? '(không rõ tên)';
    console.log(`${id}\t${name}`);
  }
  console.log('\nDán cột group_id (số bên trái) vào Cài đặt > Kênh thông báo cho đúng nhóm.');
}

main().catch((e) => { console.error('Lỗi:', e?.message ?? e); process.exit(1); });
