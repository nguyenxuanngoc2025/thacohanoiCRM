import { NextResponse, type NextRequest } from 'next/server';
import { fetchLeadDetail, verifyFbSignature, type FbLeadField } from '@/lib/facebook';
import { ingestLead } from '@/lib/ingest';
import { extractPhone } from '@/lib/phone';
import { gatherIntentText } from '@/lib/lead-intent-text';
import { getFbAppSecret } from '@/lib/platform-settings';

// GET — Facebook xác minh webhook (hub.challenge)
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const mode = sp.get('hub.mode');
  const token = sp.get('hub.verify_token');
  const challenge = sp.get('hub.challenge');
  if (mode === 'subscribe' && token === process.env.FB_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// POST — nhận leadgen, lấy chi tiết, nạp vào CRM
export async function POST(request: NextRequest) {
  try {
    // Đọc body GỐC để xác thực chữ ký (HMAC tính trên đúng chuỗi này).
    const rawBody = await request.text();

    // CHẨN ĐOÁN: mọi POST tới đây đều ghi lại (kể cả trước khi kiểm chữ ký) để phân biệt
    // "FB không gửi gì" với "gửi tới nhưng sai chữ ký". In đầu payload (đủ soi page_id/recipient).
    console.log(
      `[fb-webhook] POST nhận: bytes=${rawBody.length} sig=${request.headers.get('x-hub-signature-256') ? 'có' : 'thiếu'} head=${rawBody.slice(0, 220)}`,
    );

    // Kiểm chữ ký X-Hub-Signature-256 chống lead giả (ai biết page_id công khai cũng
    // POST được). Có FB_APP_SECRET → bắt buộc đúng chữ ký; chưa cấu hình → bỏ qua kiểm
    // (fail-open) để không chặn lead thật khi env chưa set.
    // Lấy App Secret: ưu tiên env, nếu chưa có thì lấy từ cấu hình nền tảng (chủ nền tảng
    // nhập trong giao diện) — nhờ vậy không cần thao tác máy chủ.
    const appSecret = await getFbAppSecret();
    if (appSecret) {
      if (!verifyFbSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
        console.warn(`[fb-webhook] chữ ký không hợp lệ — bỏ qua. head=${rawBody.slice(0, 220)}`);
        return NextResponse.json({ ok: false }, { status: 200 }); // 200 để FB không retry bão
      }
    } else {
      console.warn('[fb-webhook] FB_APP_SECRET chưa cấu hình — bỏ qua kiểm chữ ký.');
    }

    const body = JSON.parse(rawBody);
    if (body.object !== 'page') return NextResponse.json({ ok: true });

    for (const entry of body.entry ?? []) {
      const pageId = String(entry.id);

      // Chẩn đoán: ghi rõ mỗi entry có nhánh nào (giúp soi tin nhắn về standby hay messaging).
      console.log(
        `[fb-webhook] entry page=${pageId} changes=${(entry.changes ?? []).length} messaging=${(entry.messaging ?? []).length} standby=${(entry.standby ?? []).length}`,
      );

      // a) Lead Ads (form) — leadgen
      // b) Comment công khai có SĐT — field 'feed', item 'comment'
      for (const change of entry.changes ?? []) {
        if (change.field === 'leadgen') {
          const leadgenId = change.value?.leadgen_id;
          if (!leadgenId) continue;
          const detail = await fetchLeadDetail(String(leadgenId));
          const fieldData = ((detail.raw as { field_data?: FbLeadField[] })?.field_data) ?? [];
          const intentText = gatherIntentText({
            fieldData,
            formName: detail.formName,
            adName: detail.adName,
            campaignName: detail.campaignName,
          });
          await ingestLead({
            page_id: pageId,
            phone_raw: detail.phone,
            full_name: detail.fullName,
            source: 'facebook',
            fb_lead_id: String(leadgenId),
            external_payload: detail.raw as Record<string, unknown>,
            intent_text: intentText,
          });
          continue;
        }

        if (change.field === 'feed') {
          const v = change.value ?? {};
          if (v.item !== 'comment' || v.verb !== 'add') continue;
          if (v.from?.id && String(v.from.id) === pageId) continue; // bỏ comment của chính page
          const phone = extractPhone(v.message);
          if (!phone) continue;
          await ingestLead({
            page_id: pageId,
            phone_raw: phone,
            full_name: v.from?.name ?? null,
            source: 'fb_comment',
            fb_lead_id: v.comment_id ? String(v.comment_id) : null,
            external_payload: v as Record<string, unknown>,
            intent_text: typeof v.message === 'string' ? v.message : '',
          });
        }
      }

      // c) Tin nhắn Messenger có SĐT (chỉ thu lead, KHÔNG trả lời tự động).
      // Gộp cả `messaging` LẪN `standby`: khi page bật Trợ lý AI/tự động (primary receiver),
      // Facebook đẩy tin cho app mình qua kênh `standby` chứ không phải `messaging`. Nếu chỉ đọc
      // `messaging` sẽ mất toàn bộ lead tin nhắn của các page có AI. Cấu trúc 2 kênh giống nhau.
      const inbound = [...(entry.messaging ?? []), ...(entry.standby ?? [])];
      for (const m of inbound) {
        if (m.message?.is_echo) continue; // bỏ tin do page gửi
        const phone = extractPhone(m.message?.text);
        if (!phone) continue;
        await ingestLead({
          page_id: pageId,
          phone_raw: phone,
          full_name: null,
          source: 'fb_message',
          fb_lead_id: m.message?.mid ? String(m.message.mid) : null,
          external_payload: m as Record<string, unknown>,
          intent_text: typeof m.message?.text === 'string' ? m.message.text : '',
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[fb-webhook] error:', e);
    return NextResponse.json({ ok: false }, { status: 200 }); // 200 để FB không retry bão
  }
}
