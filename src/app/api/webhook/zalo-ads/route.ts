import { NextResponse, type NextRequest } from 'next/server';
import { ingestLead } from '@/lib/ingest';

// POST — nhận lead từ quảng cáo Zalo Lead Form.
// Bảo vệ bằng token bí mật trên query (?token=...) so với env ZALO_ADS_INGEST_TOKEN.
// Payload trung lập: { oa_id, name, phone, form_name?, ad_name? }.
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const expected = process.env.ZALO_ADS_INGEST_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      oa_id?: string; name?: string; phone?: string;
      form_name?: string; ad_name?: string;
    };
    const oaId = body.oa_id != null ? String(body.oa_id).trim() : '';
    const phone = body.phone != null ? String(body.phone).trim() : '';
    if (!oaId || !phone) {
      return NextResponse.json({ error: 'Thiếu oa_id hoặc phone' }, { status: 400 });
    }

    const intentText = [body.form_name, body.ad_name, body.name]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join(' ');

    const result = await ingestLead({
      page_id: oaId,
      phone_raw: phone,
      full_name: body.name?.trim() || null,
      source: 'zalo_ads',
      external_payload: body as Record<string, unknown>,
      intent_text: intentText,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    console.error('[zalo-ads-webhook] error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
