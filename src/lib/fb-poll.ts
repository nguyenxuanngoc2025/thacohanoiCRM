import { ingestLead } from '@/lib/ingest';
import { extractPhone } from '@/lib/phone';

/**
 * Quét lead từ Graph API (KHÔNG phụ thuộc webhook) — dùng cho page bật Trợ lý AI:
 * khi AI là chủ hội thoại, Facebook KHÔNG đẩy tin nhắn qua webhook cho app mình, nên
 * ta chủ động đọc hội thoại/bình luận định kỳ để bắt SĐT. AI vẫn trả lời khách như thường.
 *
 * Mọi lead đi qua cùng cửa `ingestLead` (dò dòng xe + chống trùng + phân giao 3 cấp + báo Zalo).
 * `silent_dedup=true` vì mỗi lượt quét lặp lại cửa sổ thời gian → lead cũ sẽ "trùng" mỗi lượt,
 * không ghi lead_logs từng lượt để tránh spam.
 */

const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION ?? 'v21.0'}`;

interface FbAuthor { id?: string; name?: string }
interface FbConversation { id: string; updated_time: string }
interface FbMessage { id?: string; message?: string; from?: FbAuthor; created_time: string }
interface FbPost { id: string; created_time: string }
interface FbComment { id?: string; message?: string; from?: FbAuthor; created_time: string }
interface FbList<T> { data?: T[] }

async function graph<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const j = (await r.json()) as T & { error?: { message?: string } };
  if (!r.ok || j?.error) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
  return j;
}

/** Lấy page access token từ System User token (page phải nằm trong BM mà system user quản lý). */
export async function getPageToken(pageId: string): Promise<string | null> {
  const sys = process.env.FB_SYSTEM_USER_TOKEN;
  if (!sys) return null;
  try {
    const j = await graph<{ access_token?: string }>(
      `${GRAPH}/${pageId}?fields=access_token&access_token=${sys}`,
    );
    return j?.access_token ?? null;
  } catch {
    return null;
  }
}

export interface PollResult { scanned: number; fresh: number; dup: number }

/** Quét TIN NHẮN: hội thoại có updated_time >= sinceMs; bắt SĐT trong tin của KHÁCH (from != page). */
export async function pollPageMessages(
  pageId: string,
  pageToken: string,
  sinceMs: number,
): Promise<PollResult> {
  const res: PollResult = { scanned: 0, fresh: 0, dup: 0 };
  // Chỉ trang đầu (25 hội thoại mới nhất, sort updated_time desc) là đủ cho cửa sổ vài phút.
  const conv = await graph<FbList<FbConversation>>(
    `${GRAPH}/${pageId}/conversations?fields=id,updated_time&limit=25&access_token=${pageToken}`,
  );
  for (const c of conv.data ?? []) {
    if (new Date(c.updated_time).getTime() < sinceMs) break; // đã sort desc → dừng khi ra khỏi cửa sổ
    const msgs = await graph<FbList<FbMessage>>(
      `${GRAPH}/${c.id}/messages?fields=id,message,from,created_time&limit=15&access_token=${pageToken}`,
    );
    for (const m of msgs.data ?? []) {
      if (new Date(m.created_time).getTime() < sinceMs) continue; // ngoài cửa sổ → bỏ
      if (m.from?.id && String(m.from.id) === pageId) continue; // tin do page (kể cả AI) gửi
      const phone = extractPhone(m.message);
      if (!phone) continue;
      res.scanned++;
      const out = await ingestLead({
        page_id: pageId,
        phone_raw: phone,
        full_name: m.from?.name ?? null,
        source: 'fb_message',
        fb_lead_id: m.id ? String(m.id) : null,
        external_payload: m as unknown as Record<string, unknown>,
        intent_text: typeof m.message === 'string' ? m.message : '',
        silent_dedup: true,
      });
      if (out.ok && !out.deduped) res.fresh++;
      else if (out.ok && out.deduped) res.dup++;
    }
  }
  return res;
}

/** Quét BÌNH LUẬN: bài đăng gần đây, bình luận created_time >= sinceMs của KHÁCH có SĐT (lưới an toàn — comment vẫn về qua webhook feed). */
export async function pollPageComments(
  pageId: string,
  pageToken: string,
  sinceMs: number,
  postCutoffDays = 30,
): Promise<PollResult> {
  const res: PollResult = { scanned: 0, fresh: 0, dup: 0 };
  const postCutoff = Date.now() - postCutoffDays * 86400 * 1000;
  const feed = await graph<FbList<FbPost>>(
    `${GRAPH}/${pageId}/feed?fields=id,created_time&limit=15&access_token=${pageToken}`,
  );
  for (const post of feed.data ?? []) {
    if (new Date(post.created_time).getTime() < postCutoff) break; // bài quá cũ → dừng
    let comments: FbList<FbComment>;
    try {
      comments = await graph<FbList<FbComment>>(
        `${GRAPH}/${post.id}/comments?fields=id,message,from,created_time&limit=50&order=reverse_chronological&filter=stream&access_token=${pageToken}`,
      );
    } catch {
      continue; // 1 bài lỗi comment → bỏ qua, không chặn cả lượt
    }
    for (const cm of comments.data ?? []) {
      if (new Date(cm.created_time).getTime() < sinceMs) break; // newest-first → dừng khi ra khỏi cửa sổ
      if (cm.from?.id && String(cm.from.id) === pageId) continue; // comment của chính page
      const phone = extractPhone(cm.message);
      if (!phone) continue;
      res.scanned++;
      const out = await ingestLead({
        page_id: pageId,
        phone_raw: phone,
        full_name: cm.from?.name ?? null,
        source: 'fb_comment',
        fb_lead_id: cm.id ? String(cm.id) : null,
        external_payload: cm as unknown as Record<string, unknown>,
        intent_text: typeof cm.message === 'string' ? cm.message : '',
        silent_dedup: true,
      });
      if (out.ok && !out.deduped) res.fresh++;
      else if (out.ok && out.deduped) res.dup++;
    }
  }
  return res;
}
