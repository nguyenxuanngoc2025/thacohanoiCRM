import { createHmac, timingSafeEqual } from 'node:crypto';

const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION ?? 'v21.0'}`;

export interface FbLeadField { name: string; values: string[] }

/**
 * Xác thực chữ ký webhook Facebook (header `X-Hub-Signature-256`).
 * Facebook ký body bằng HMAC-SHA256 với App Secret làm khoá:
 *   signature = 'sha256=' + HMAC_SHA256(appSecret, rawBody)
 * rawBody phải là chuỗi body GỐC (chưa qua JSON.parse).
 * Trả false nếu thiếu tham số hoặc chữ ký không khớp.
 */
export function verifyFbSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | null | undefined,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;
  if (!provided) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  // So sánh chống timing attack — độ dài phải bằng nhau trước.
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Lấy chi tiết lead form từ Graph API bằng System User token. */
export async function fetchLeadDetail(leadgenId: string): Promise<{
  fullName: string | null; phone: string | null; raw: unknown;
  adName: string | null; formName: string | null; campaignName: string | null;
}> {
  const token = process.env.FB_SYSTEM_USER_TOKEN!;
  // Node leadgen KHÔNG có field `form_name` (chỉ có `form_id`). Nếu xin `form_name`,
  // FB từ chối CẢ request (#100) → mất luôn field_data (SĐT/tên). Lấy `form_id` rồi
  // gọi riêng tên form ở dưới.
  const res = await fetch(`${GRAPH}/${leadgenId}?fields=field_data,ad_name,campaign_name,form_id&access_token=${token}`);
  const raw = await res.json();
  if (!res.ok) {
    // Token hết hạn / rate limit → KHÔNG nuốt lỗi âm thầm, để webhook log lại.
    console.error('[facebook] fetchLeadDetail non-200:', res.status, raw);
  }
  const fields: FbLeadField[] = raw?.field_data ?? [];
  const get = (keys: string[]) =>
    fields.find((f) => keys.includes(f.name))?.values?.[0] ?? null;

  // Tên form (dùng cho dò dòng xe) — gọi riêng node form, lỗi thì bỏ qua (không chặn lead).
  let formName: string | null = null;
  const formId = typeof raw?.form_id === 'string' ? raw.form_id : null;
  if (formId) {
    try {
      const fr = await fetch(`${GRAPH}/${formId}?fields=name&access_token=${token}`);
      const fj = await fr.json();
      if (fr.ok && typeof fj?.name === 'string') formName = fj.name;
    } catch (e) {
      console.error('[facebook] fetch form name lỗi:', e);
    }
  }

  return {
    fullName: get(['full_name', 'name', 'họ_và_tên']),
    phone: get(['phone_number', 'phone', 'số_điện_thoại']),
    raw,
    adName: typeof raw?.ad_name === 'string' ? raw.ad_name : null,
    formName,
    campaignName: typeof raw?.campaign_name === 'string' ? raw.campaign_name : null,
  };
}

export interface BackfillLead {
  leadgenId: string;
  createdTime: string; // ISO — thời điểm gốc trên Facebook
  fullName: string | null;
  phone: string | null;
  formName: string | null;
  adName: string | null;
  campaignName: string | null;
  raw: unknown;
}

/**
 * Kéo TẤT CẢ lead form của 1 fanpage phát sinh SAU mốc `sinceUnix` (giây epoch).
 * Dùng cho backfill khi kênh được kết nối trễ hơn thời điểm lead xuất hiện → webhook
 * chưa nhận được. Duyệt từng biểu mẫu + phân trang; lỗi 1 form thì bỏ qua form đó.
 */
export async function fetchPageLeadsSince(pageId: string, sinceUnix: number): Promise<BackfillLead[]> {
  const token = process.env.FB_SYSTEM_USER_TOKEN;
  if (!token) throw new Error('Thiếu FB_SYSTEM_USER_TOKEN');

  const pr = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${token}`);
  const pj = await pr.json();
  const pageToken: string | undefined = pj?.access_token;
  if (!pageToken) throw new Error(pj?.error?.message ?? 'Không lấy được page token');

  // Liệt kê biểu mẫu (phân trang).
  const forms: { id: string; name: string }[] = [];
  let formsUrl = `${GRAPH}/${pageId}/leadgen_forms?fields=id,name&limit=100&access_token=${pageToken}`;
  while (formsUrl) {
    const r = await fetch(formsUrl);
    const j = await r.json();
    if (!r.ok) { console.error('[facebook] list forms lỗi:', j?.error); break; }
    for (const f of j?.data ?? []) forms.push({ id: f.id, name: f.name });
    formsUrl = j?.paging?.next ?? '';
  }

  const out: BackfillLead[] = [];
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: sinceUnix }]),
  );
  for (const form of forms) {
    let url = `${GRAPH}/${form.id}/leads?fields=id,created_time,field_data,ad_name,campaign_name&filtering=${filtering}&limit=100&access_token=${pageToken}`;
    while (url) {
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) { console.error('[facebook] list leads lỗi:', form.name, j?.error); break; }
      for (const lead of j?.data ?? []) {
        const fields: FbLeadField[] = lead?.field_data ?? [];
        const get = (keys: string[]) => fields.find((f) => keys.includes(f.name))?.values?.[0] ?? null;
        out.push({
          leadgenId: String(lead.id),
          createdTime: lead.created_time,
          fullName: get(['full_name', 'name', 'họ_và_tên']),
          phone: get(['phone_number', 'phone', 'số_điện_thoại']),
          formName: form.name,
          adName: typeof lead.ad_name === 'string' ? lead.ad_name : null,
          campaignName: typeof lead.campaign_name === 'string' ? lead.campaign_name : null,
          raw: lead,
        });
      }
      url = j?.paging?.next ?? '';
    }
  }
  return out;
}

// Các field webhook fanpage cần để CRM bắt đủ lead: Lead Ads + tin nhắn + bình luận.
const PAGE_WEBHOOK_FIELDS = 'leadgen,messages,feed';
const REQUIRED_WEBHOOK_FIELDS = ['leadgen', 'messages', 'feed'];

export interface HealthCheck { label: string; status: 'ok' | 'warn' | 'fail'; detail: string }
export interface HealthResult { ok: boolean; checks: HealthCheck[] }

/**
 * Kiểm tra "sức khoẻ" kết nối 1 fanpage: token hệ thống còn sống? webhook còn đăng ký
 * đủ field? đọc được form lead không? Trả danh sách check để hiện cho admin (không lộ token).
 */
export async function checkFacebookPageHealth(pageId: string): Promise<HealthResult> {
  const checks: HealthCheck[] = [];
  const token = process.env.FB_SYSTEM_USER_TOKEN;

  if (!token) {
    checks.push({ label: 'Token hệ thống', status: 'fail', detail: 'Máy chủ chưa cấu hình FB_SYSTEM_USER_TOKEN.' });
    return { ok: false, checks };
  }

  // 1) Token còn sống?
  try {
    const r = await fetch(`${GRAPH}/me?fields=id,name&access_token=${token}`);
    const j = await r.json();
    if (r.ok && j?.id) {
      checks.push({ label: 'Token hệ thống', status: 'ok', detail: `Còn hiệu lực (${j.name ?? j.id}).` });
    } else {
      checks.push({ label: 'Token hệ thống', status: 'fail', detail: j?.error?.message ?? 'Token không phản hồi hợp lệ.' });
      return { ok: false, checks };
    }
  } catch {
    checks.push({ label: 'Token hệ thống', status: 'fail', detail: 'Không gọi được Facebook (mạng/máy chủ).' });
    return { ok: false, checks };
  }

  // 2) Lấy được page token (fanpage nằm trong Business Manager của token)?
  let pageToken: string | undefined;
  try {
    const r = await fetch(`${GRAPH}/${pageId}?fields=access_token,name&access_token=${token}`);
    const j = await r.json();
    pageToken = j?.access_token;
    if (pageToken) {
      checks.push({ label: 'Quyền trên fanpage', status: 'ok', detail: `Truy cập được fanpage${j?.name ? ` "${j.name}"` : ''}.` });
    } else {
      checks.push({ label: 'Quyền trên fanpage', status: 'fail', detail: j?.error?.message ?? 'Không lấy được quyền trang (fanpage đã nằm trong Business Manager chưa?).' });
      return { ok: false, checks };
    }
  } catch {
    checks.push({ label: 'Quyền trên fanpage', status: 'fail', detail: 'Không gọi được Facebook.' });
    return { ok: false, checks };
  }

  // 3) Webhook còn đăng ký đủ field (leadgen/messages/feed)?
  try {
    const r = await fetch(`${GRAPH}/${pageId}/subscribed_apps?access_token=${pageToken}`);
    const j = await r.json();
    const subs: string[] = (j?.data ?? []).flatMap((d: { subscribed_fields?: string[] }) => d.subscribed_fields ?? []);
    const missing = REQUIRED_WEBHOOK_FIELDS.filter((f) => !subs.includes(f));
    if (subs.length === 0) {
      checks.push({ label: 'Webhook nhận lead', status: 'fail', detail: 'Fanpage chưa đăng ký webhook — lead sẽ KHÔNG về. Bấm Sửa rồi Lưu để đăng ký lại.' });
    } else if (missing.length > 0) {
      checks.push({ label: 'Webhook nhận lead', status: 'warn', detail: `Thiếu loại: ${missing.join(', ')}. Bấm Sửa rồi Lưu để đăng ký lại đủ.` });
    } else {
      checks.push({ label: 'Webhook nhận lead', status: 'ok', detail: 'Đã đăng ký đủ: form, tin nhắn, bình luận.' });
    }
  } catch {
    checks.push({ label: 'Webhook nhận lead', status: 'warn', detail: 'Không kiểm tra được trạng thái webhook.' });
  }

  // 4) Đọc được biểu mẫu lead không (quyền leads_retrieval)?
  try {
    const r = await fetch(`${GRAPH}/${pageId}/leadgen_forms?fields=id&limit=1&access_token=${pageToken}`);
    const j = await r.json();
    if (r.ok && Array.isArray(j?.data)) {
      checks.push({ label: 'Đọc biểu mẫu lead', status: 'ok', detail: 'Lấy được dữ liệu lead từ form quảng cáo.' });
    } else {
      checks.push({ label: 'Đọc biểu mẫu lead', status: 'warn', detail: j?.error?.message ?? 'Chưa đọc được biểu mẫu lead.' });
    }
  } catch {
    checks.push({ label: 'Đọc biểu mẫu lead', status: 'warn', detail: 'Không gọi được Facebook.' });
  }

  return { ok: !checks.some((c) => c.status === 'fail'), checks };
}

/**
 * Đăng ký fanpage vào webhook của app (subscribed_apps) để lead về tự động.
 * Tự lấy page token từ System User token (page phải nằm trong BM mà system user quản lý).
 * Trả {ok:false, error} nếu thiếu token / page chưa trong BM — KHÔNG throw để không chặn lưu kênh.
 */
export async function subscribePageWebhook(pageId: string): Promise<{ ok: boolean; error?: string }> {
  const sysToken = process.env.FB_SYSTEM_USER_TOKEN;
  if (!sysToken) return { ok: false, error: 'Thiếu FB_SYSTEM_USER_TOKEN trên máy chủ.' };

  // 1) Lấy page access token từ system user token
  const r1 = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${sysToken}`);
  const j1 = await r1.json();
  const pageToken: string | undefined = j1?.access_token;
  if (!pageToken) {
    return { ok: false, error: j1?.error?.message ?? 'Không lấy được page token (fanpage đã ở trong BM chưa?).' };
  }

  // 2) Subscribe app vào page với đủ field
  const r2 = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribed_fields: PAGE_WEBHOOK_FIELDS, access_token: pageToken }),
  });
  const j2 = await r2.json();
  if (!r2.ok || !j2?.success) {
    return { ok: false, error: j2?.error?.message ?? 'Đăng ký webhook thất bại.' };
  }
  return { ok: true };
}
