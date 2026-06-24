/**
 * seed-demo.mjs — tạo dữ liệu giả để demo trang Lead.
 * - 1 showroom Mazda (nếu chưa có) + 3 TVBH demo (qua GoTrue admin API)
 * - ~30 lead đa dạng: dòng xe / trạng thái / thời điểm liên hệ / ghi chú
 * Idempotent: xoá lead demo cũ (external_payload.demo=true) trước khi nạp lại.
 *
 * Chạy: node scripts/seed-demo.mjs
 */

const URL = 'https://studio.ngocnguyenxuan.com';
const SVC =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzIxMjUyMDAsImV4cCI6MTkyOTg5MTYwMH0.EswkDe7Zm8fNHw2pc08qoDYz5ahrk8koVHydLDQQSYU';
const SCHEMA = 'crm_thacoauto';

const restHeaders = (extra = {}) => ({
  apikey: SVC,
  Authorization: `Bearer ${SVC}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function rget(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: restHeaders({ 'Accept-Profile': SCHEMA }),
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function rpost(table, body, prefer = 'return=representation') {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: restHeaders({ 'Content-Profile': SCHEMA, Prefer: prefer }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${table} → ${r.status} ${await r.text()}`);
  return prefer.includes('return=minimal') ? null : r.json();
}

async function rdelete(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: restHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
  });
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status} ${await r.text()}`);
}

/** Tạo auth user qua GoTrue admin (đúng cột chuẩn). Idempotent theo email. */
async function ensureTvbh(email, fullName, companyId, showroomId) {
  // đã có profile?
  const existing = await rget(`users?select=id&email=eq.${encodeURIComponent(email)}`);
  if (existing.length) return existing[0].id;

  // tạo auth user
  const ar = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: restHeaders(),
    body: JSON.stringify({
      email,
      password: 'thaco123',
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'tvbh' },
    }),
  });
  let uid;
  if (ar.ok) {
    uid = (await ar.json()).id;
  } else {
    const txt = await ar.text();
    // user auth đã tồn tại → lấy id qua admin list
    if (ar.status === 422 || txt.includes('already')) {
      const lr = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers: restHeaders() });
      const list = await lr.json();
      const found = (list.users ?? []).find((u) => u.email === email);
      if (!found) throw new Error(`Không tìm được auth user ${email}: ${txt}`);
      uid = found.id;
    } else {
      throw new Error(`Tạo auth user ${email} lỗi: ${ar.status} ${txt}`);
    }
  }

  await rpost(
    'users',
    { id: uid, email, full_name: fullName, role: 'tvbh', company_id: companyId, showroom_id: showroomId, is_active: true },
    'resolution=merge-duplicates,return=minimal',
  );
  return uid;
}

const NAMES = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Thu Dung', 'Hoàng Minh Đức',
  'Vũ Thị Hồng Én', 'Đặng Quốc Phong', 'Bùi Thị Giang', 'Đỗ Văn Hải', 'Ngô Thị Hoa',
  'Trịnh Minh Khoa', 'Lý Thị Lan', 'Mai Văn Long', 'Phan Thị Mai', 'Cao Đức Nam',
  'Đinh Thị Nga', 'Dương Văn Phúc', 'Hồ Thị Quỳnh', 'Tạ Minh Sơn', 'Lương Thị Thu',
  'Võ Văn Tuấn', 'Chu Thị Uyên', 'Nguyễn Đức Việt', 'Trần Thị Xuân', 'Lê Văn Yên',
  'Phạm Quang Vinh', 'Hoàng Thị Diệp', 'Vũ Đình Khang', 'Đỗ Thị Lệ', 'Bùi Văn Sang',
];

const NOTES = [
  'Khách hỏi giá lăn bánh, hẹn gọi lại buổi chiều.',
  'Đã tư vấn gói trả góp 70%, khách cân nhắc.',
  'Khách bận, hẹn cuối tuần ghé showroom xem xe.',
  'Quan tâm bản màu trắng, chờ xe về kho.',
  'Đã gửi báo giá chi tiết qua Zalo.',
  'Khách đang so sánh với mẫu đối thủ.',
  'Hẹn lái thử vào thứ 7 tuần này.',
  'Gọi 2 lần chưa bắt máy, sẽ nhắn tin lại.',
  'Khách đã đặt cọc, chờ làm hợp đồng.',
  'Tư vấn thêm về bảo hành và phụ kiện.',
];

const SOURCES = ['facebook', 'zalo', 'hotline', 'walk-in', 'website'];
const STATUS_POOL = [
  ...Array(12).fill('KHQT'), ...Array(7).fill('GDTD'), ...Array(4).fill('Chưa LH được'),
  ...Array(4).fill('KHĐ'), ...Array(3).fill('Fail'),
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const daysAgo = (d) => new Date(Date.now() - d * 86400000);

async function main() {
  const [company] = await rget('companies?select=id&slug=eq.thaco-auto-hanoi');
  if (!company) throw new Error('Chưa có company thaco-auto-hanoi');
  const companyId = company.id;

  const brands = await rget('brands?select=id,slug,name');
  const kia = brands.find((b) => b.slug === 'kia');
  const mazda = brands.find((b) => b.slug === 'mazda');

  // showrooms: đảm bảo có 1 showroom Mazda demo
  let showrooms = await rget('showrooms?select=id,brand_id,code,name');
  let kiaSr = showrooms.find((s) => s.brand_id === kia.id);
  let mazdaSr = showrooms.find((s) => s.brand_id === mazda.id);
  if (!mazdaSr) {
    [mazdaSr] = await rpost('showrooms', {
      company_id: companyId, brand_id: mazda.id, name: 'Mazda Hà Nội (demo)', code: 'MAZDA-HN-01',
    });
  }

  // models theo brand
  const models = await rget('models?select=id,brand_id,name&is_active=eq.true');
  const kiaModels = models.filter((m) => m.brand_id === kia.id);
  const mazdaModels = models.filter((m) => m.brand_id === mazda.id);

  // 3 TVBH: 2 KIA, 1 Mazda
  const t1 = await ensureTvbh('tvbh.kia1@thaco.com.vn', 'Nguyễn Thành Trung', companyId, kiaSr.id);
  const t2 = await ensureTvbh('tvbh.kia2@thaco.com.vn', 'Lê Thị Phương Anh', companyId, kiaSr.id);
  const t3 = await ensureTvbh('tvbh.mazda1@thaco.com.vn', 'Phạm Quốc Bảo', companyId, mazdaSr.id);
  const kiaTvbh = [t1, t2];
  const mazdaTvbh = [t3];

  // dọn lead demo cũ
  await rdelete('leads?external_payload->>demo=eq.true');

  // tạo ~30 lead
  const rows = [];
  for (let i = 0; i < NAMES.length; i++) {
    const isKia = Math.random() < 0.6;
    const brand = isKia ? kia : mazda;
    const sr = isKia ? kiaSr : mazdaSr;
    const mdl = pick(isKia ? kiaModels : mazdaModels);
    const assignee = pick(isKia ? kiaTvbh : mazdaTvbh);
    const status = pick(STATUS_POOL);
    const createdDays = Math.floor(Math.random() * 30);
    const created = daysAgo(createdDays);
    const contacted = status !== 'KHQT' || Math.random() < 0.4;
    const lastContact = contacted
      ? new Date(created.getTime() + Math.random() * (createdDays + 1) * 43200000)
      : null;
    const phone = `+8490${String(1000000 + i * 13337 + Math.floor(Math.random() * 999)).slice(0, 7)}`;

    rows.push({
      company_id: companyId,
      showroom_id: sr.id,
      brand_id: brand.id,
      assigned_to: assignee,
      model_id: mdl?.id ?? null,
      phone,
      phone_raw: phone,
      full_name: NAMES[i],
      source: pick(SOURCES),
      status,
      round: 1,
      created_at: created.toISOString(),
      updated_at: (lastContact ?? created).toISOString(),
      last_contact_at: lastContact ? lastContact.toISOString() : null,
      last_note: contacted ? pick(NOTES) : null,
      next_contact_at: !contacted ? daysAgo(-Math.ceil(Math.random() * 3)).toISOString() : null,
      external_payload: { demo: true },
    });
  }

  const inserted = await rpost('leads', rows, 'return=representation');

  // ghi log liên hệ cho lead đã liên hệ
  const logs = inserted
    .filter((l) => l.last_contact_at)
    .map((l) => ({
      lead_id: l.id,
      user_id: l.assigned_to,
      type: 'contact',
      content: l.last_note,
      created_at: l.last_contact_at,
    }));
  if (logs.length) await rpost('lead_logs', logs, 'return=minimal');

  console.log(`✓ Seed xong: ${inserted.length} lead, ${logs.length} log liên hệ.`);
  console.log(`  TVBH demo: tvbh.kia1 / tvbh.kia2 / tvbh.mazda1 @thaco.com.vn (mật khẩu thaco123)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
