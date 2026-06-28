import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyZaloSignature } from '@/lib/zalo';
import { ingestLead } from '@/lib/ingest';
import { extractPhone } from '@/lib/phone';

// GET — Zalo gọi để kiểm tra URL webhook còn sống. Trả 200.
export async function GET() {
  return new NextResponse('OK', { status: 200 });
}

// POST — nhận sự kiện Zalo OA. Chỉ thu lead khi tin nhắn có SĐT.
// Luôn trả 200 (kể cả bỏ qua / lỗi) để Zalo không retry bão.
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: true });
    }

    const oaId = body.oa_id != null ? String(body.oa_id) : '';
    const appId = body.app_id != null ? String(body.app_id) : '';
    const timestamp = body.timestamp as string | number | undefined;
    const eventName = String(body.event_name ?? '');
    if (!oaId) return NextResponse.json({ ok: true });

    // Chỉ xử lý tin nhắn văn bản từ người dùng (đủ để bắt SĐT).
    if (eventName !== 'user_send_text') return NextResponse.json({ ok: true });

    // Tra kênh theo OA id để lấy secret xác thực chữ ký.
    const db = createServiceClient();
    const { data: channel } = await db
      .from('channel_accounts')
      .select('id, secret, is_active')
      .eq('page_id', oaId)
      .eq('is_active', true)
      .maybeSingle();
    if (!channel) return NextResponse.json({ ok: true }); // OA chưa khai báo → bỏ qua

    // Bắt buộc có secret để xác thực; chưa cấu hình thì bỏ qua (không tin nguồn chưa verify được).
    if (!channel.secret) {
      console.warn('[zalo-webhook] OA chưa cấu hình secret, bỏ qua:', oaId);
      return NextResponse.json({ ok: true });
    }
    const valid = verifyZaloSignature({
      signatureHeader: request.headers.get('x-zevent-signature'),
      appId,
      rawBody,
      timestamp,
      secret: channel.secret,
    });
    if (!valid) {
      console.warn('[zalo-webhook] chữ ký không hợp lệ, bỏ qua:', oaId);
      return NextResponse.json({ ok: true });
    }

    const message = (body.message ?? {}) as { text?: string; msg_id?: string };
    const text = typeof message.text === 'string' ? message.text : '';
    const phone = extractPhone(text);
    if (!phone) return NextResponse.json({ ok: true }); // không SĐT = không phải lead

    await ingestLead({
      page_id: oaId,
      phone_raw: phone,
      full_name: null,
      source: 'zalo',
      fb_lead_id: message.msg_id ? String(message.msg_id) : null,
      external_payload: body,
      intent_text: text,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[zalo-webhook] error:', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
