import { NextResponse, type NextRequest } from 'next/server';
import { fetchLeadDetail } from '@/lib/facebook';
import { ingestLead } from '@/lib/ingest';

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
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const leadgenId = change.value?.leadgen_id;
        if (!leadgenId) continue;
        const detail = await fetchLeadDetail(String(leadgenId));
        await ingestLead({
          page_id: pageId,
          phone_raw: detail.phone,
          full_name: detail.fullName,
          source: 'facebook',
          fb_lead_id: String(leadgenId),
          external_payload: detail.raw as Record<string, unknown>,
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[fb-webhook] error:', e);
    return NextResponse.json({ ok: false }, { status: 200 }); // 200 để FB không retry bão
  }
}
