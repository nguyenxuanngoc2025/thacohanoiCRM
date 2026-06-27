const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION ?? 'v21.0'}`;

export interface FbLeadField { name: string; values: string[] }

/** Lấy chi tiết lead form từ Graph API bằng System User token. */
export async function fetchLeadDetail(leadgenId: string): Promise<{
  fullName: string | null; phone: string | null; raw: unknown;
  adName: string | null; formName: string | null; campaignName: string | null;
}> {
  const token = process.env.FB_SYSTEM_USER_TOKEN!;
  const res = await fetch(`${GRAPH}/${leadgenId}?fields=field_data,ad_name,form_name,campaign_name&access_token=${token}`);
  const raw = await res.json();
  if (!res.ok) {
    // Token hết hạn / rate limit → KHÔNG nuốt lỗi âm thầm, để webhook log lại.
    console.error('[facebook] fetchLeadDetail non-200:', res.status, raw);
  }
  const fields: FbLeadField[] = raw?.field_data ?? [];
  const get = (keys: string[]) =>
    fields.find((f) => keys.includes(f.name))?.values?.[0] ?? null;
  return {
    fullName: get(['full_name', 'name', 'họ_và_tên']),
    phone: get(['phone_number', 'phone', 'số_điện_thoại']),
    raw,
    adName: typeof raw?.ad_name === 'string' ? raw.ad_name : null,
    formName: typeof raw?.form_name === 'string' ? raw.form_name : null,
    campaignName: typeof raw?.campaign_name === 'string' ? raw.campaign_name : null,
  };
}

// Các field webhook fanpage cần để CRM bắt đủ lead: Lead Ads + tin nhắn + bình luận.
const PAGE_WEBHOOK_FIELDS = 'leadgen,messages,feed';

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
