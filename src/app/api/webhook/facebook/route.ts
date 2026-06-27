import { NextResponse, type NextRequest } from 'next/server';
import { fetchLeadDetail, type FbLeadField } from '@/lib/facebook';
import { ingestLead } from '@/lib/ingest';
import { extractPhone } from '@/lib/phone';
import { gatherIntentText } from '@/lib/lead-intent-text';

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
    const body = await request.json();
    if (body.object !== 'page') return NextResponse.json({ ok: true });

    for (const entry of body.entry ?? []) {
      const pageId = String(entry.id);

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

      // c) Tin nhắn Messenger có SĐT (chỉ thu lead, KHÔNG trả lời tự động)
      for (const m of entry.messaging ?? []) {
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
