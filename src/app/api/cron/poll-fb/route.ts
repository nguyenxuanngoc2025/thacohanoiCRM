import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { getPageToken, pollPageMessages, pollPageComments } from '@/lib/fb-poll';
import {
  setPlatformSetting,
  FB_POLL_MESSAGES_HEARTBEAT_KEY,
  FB_POLL_COMMENTS_HEARTBEAT_KEY,
} from '@/lib/platform-settings';

export const dynamic = 'force-dynamic';

/**
 * Quét lead tin nhắn/bình luận Facebook định kỳ qua Graph API (cho page bật Trợ lý AI mà
 * webhook không đẩy tin về). Gọi bởi systemd timer:
 *   - ?mode=messages : mỗi 2 phút  (kênh CHÍNH cho page có AI)
 *   - ?mode=comments : mỗi 10 phút (lưới an toàn — comment vẫn về qua webhook feed)
 */
export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get('mode') === 'comments' ? 'comments' : 'messages';
  // Cửa sổ quét có OVERLAP để không sót nếu 1 lượt lỗi/chậm: tin nhắn 15', bình luận 30'.
  // Chống trùng (silent_dedup) đảm bảo quét chồng lấn không tạo lead lặp.
  const windowMin = mode === 'comments' ? 30 : 15;
  const sinceMs = Date.now() - windowMin * 60 * 1000;

  const service = createServiceClient();
  const { data: channels } = await service
    .from('channel_accounts')
    .select('page_id, page_name')
    .eq('platform', 'facebook')
    .eq('is_active', true);

  let scanned = 0;
  let fresh = 0;
  let dup = 0;
  const errors: { page: string; error: string }[] = [];

  for (const ch of channels ?? []) {
    const pageId = String(ch.page_id);
    try {
      const pt = await getPageToken(pageId);
      if (!pt) {
        errors.push({ page: pageId, error: 'không lấy được page token' });
        continue;
      }
      const r =
        mode === 'comments'
          ? await pollPageComments(pageId, pt, sinceMs)
          : await pollPageMessages(pageId, pt, sinceMs);
      scanned += r.scanned;
      fresh += r.fresh;
      dup += r.dup;
    } catch (e) {
      errors.push({ page: pageId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Nhịp tim: ghi mốc chạy gần nhất để dashboard "Tình trạng hệ thống" + watchdog biết cron còn sống.
  await setPlatformSetting(
    mode === 'comments' ? FB_POLL_COMMENTS_HEARTBEAT_KEY : FB_POLL_MESSAGES_HEARTBEAT_KEY,
    new Date().toISOString(),
  );

  return NextResponse.json({ ok: true, mode, scanned, fresh, dup, errors });
}
