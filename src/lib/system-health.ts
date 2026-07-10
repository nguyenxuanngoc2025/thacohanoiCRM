import { createServiceClient } from '@/lib/supabase/server';
import { checkFacebookPageHealth } from '@/lib/facebook';
import {
  getPlatformSettings,
  FB_POLL_MESSAGES_HEARTBEAT_KEY,
  FB_POLL_COMMENTS_HEARTBEAT_KEY,
} from '@/lib/platform-settings';

/**
 * Tổng hợp "sức khoẻ hệ thống" cho MỘT công ty — dùng chung cho:
 *  - Dashboard "Tình trạng hệ thống" (đèn xanh/đỏ trong Cài đặt)
 *  - Watchdog cron (gửi cảnh báo Zalo khi có mục đỏ)
 *
 * Mỗi mục có `status` (ok/warn/fail) + `detail` (mô tả) + `fix` (hướng dẫn khắc phục
 * bằng tiếng Việt, viết cho người KHÔNG rành kỹ thuật). `overall` = mức xấu nhất.
 */

export type HealthStatus = 'ok' | 'warn' | 'fail';

export interface HealthItem {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  fix?: string;
}

export interface HealthGroup {
  title: string;
  items: HealthItem[];
}

export interface SystemHealth {
  overall: HealthStatus;
  groups: HealthGroup[];
  generatedAt: string;
}

const WORST: Record<HealthStatus, number> = { ok: 0, warn: 1, fail: 2 };
function worst(items: { status: HealthStatus }[]): HealthStatus {
  let s: HealthStatus = 'ok';
  for (const it of items) if (WORST[it.status] > WORST[s]) s = it.status;
  return s;
}

// Ngưỡng "quá hạn" cho nhịp tim cron (phút). Timer chạy 2' (tin) / 10' (bình luận);
// cho biên rộng để 1-2 lượt trễ không báo động giả.
const MESSAGES_STALE_MIN = 12;
const COMMENTS_STALE_MIN = 35;
// Thông báo "kẹt" nếu pending lâu hơn mốc này (bot Zalo đáng lẽ gửi trong ~10s).
const NOTIF_STUCK_MIN = 20;

function minutesAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((Date.now() - t) / 60000);
}

function fmtAgo(min: number | null): string {
  if (min == null) return 'chưa có dữ liệu';
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

// ─── Nhóm 1: Kênh Facebook ────────────────────────────────────────────────────
async function facebookGroup(companyId: string): Promise<HealthGroup> {
  const service = createServiceClient();
  const { data: srRows } = await service.from('showrooms').select('id').eq('company_id', companyId);
  const srIds = ((srRows ?? []) as { id: string }[]).map((r) => r.id);

  const items: HealthItem[] = [];
  if (srIds.length === 0) {
    return { title: 'Kênh Facebook', items: [{ key: 'fb_none', label: 'Kênh Facebook', status: 'warn', detail: 'Chưa có showroom nào để gắn kênh Facebook.' }] };
  }

  const { data: channels } = await service
    .from('channel_accounts')
    .select('id, page_id, page_name')
    .eq('platform', 'facebook')
    .eq('is_active', true)
    .in('showroom_id', srIds);

  const list = (channels ?? []) as { id: string; page_id: string; page_name: string | null }[];
  if (list.length === 0) {
    return { title: 'Kênh Facebook', items: [{ key: 'fb_none', label: 'Kênh Facebook', status: 'warn', detail: 'Chưa kết nối fanpage nào. Vào Cài đặt → Tích hợp để thêm.' }] };
  }

  // Chạy song song nhưng có giới hạn ngầm (số page thực tế nhỏ) — mỗi page vài lệnh Graph.
  const results = await Promise.all(
    list.map(async (ch) => {
      const name = ch.page_name || `Fanpage ${ch.page_id}`;
      try {
        const h = await checkFacebookPageHealth(String(ch.page_id));
        const st: HealthStatus = h.checks.some((c) => c.status === 'fail')
          ? 'fail'
          : h.checks.some((c) => c.status === 'warn')
            ? 'warn'
            : 'ok';
        const bad = h.checks.find((c) => c.status === 'fail') ?? h.checks.find((c) => c.status === 'warn');
        const detail = st === 'ok'
          ? 'Kết nối tốt — token còn hạn, đọc được lead.'
          : `${bad?.label}: ${bad?.detail}`;
        const fix = st === 'fail'
          ? 'Vào Cài đặt → Tích hợp, bấm Sửa fanpage rồi Lưu để đăng ký lại. Nếu vẫn đỏ, token hệ thống Facebook có thể đã hết hạn — cần cấp lại token trong Business Manager.'
          : undefined;
        return { key: `fb_${ch.id}`, label: name, status: st, detail, fix };
      } catch {
        return { key: `fb_${ch.id}`, label: name, status: 'fail' as HealthStatus, detail: 'Không kiểm tra được (mạng hoặc Facebook không phản hồi).', fix: 'Thử lại sau vài phút. Nếu kéo dài, kiểm tra kết nối máy chủ tới Facebook.' };
      }
    }),
  );
  items.push(...results);
  return { title: 'Kênh Facebook', items };
}

// ─── Nhóm 2: Quét tự động Facebook (cron) ─────────────────────────────────────
async function pollGroup(): Promise<HealthGroup> {
  const map = await getPlatformSettings([FB_POLL_MESSAGES_HEARTBEAT_KEY, FB_POLL_COMMENTS_HEARTBEAT_KEY]);
  const mkItem = (key: string, label: string, iso: string | null, staleMin: number): HealthItem => {
    const ago = minutesAgo(iso);
    if (ago == null) {
      return { key, label, status: 'warn', detail: 'Chưa ghi nhận lần quét nào.', fix: 'Cron có thể chưa được bật trên máy chủ. Báo kỹ thuật kiểm tra bộ hẹn giờ quét Facebook.' };
    }
    if (ago > staleMin) {
      return { key, label, status: 'fail', detail: `Lần quét gần nhất: ${fmtAgo(ago)} (quá hạn).`, fix: 'Bộ quét tự động đã ngừng chạy → lead tin nhắn/bình luận sẽ KHÔNG về. Báo kỹ thuật khởi động lại bộ hẹn giờ quét Facebook trên máy chủ.' };
    }
    return { key, label, status: 'ok', detail: `Lần quét gần nhất: ${fmtAgo(ago)}.` };
  };
  return {
    title: 'Quét tự động Facebook',
    items: [
      mkItem('poll_messages', 'Quét tin nhắn (2 phút/lần)', map[FB_POLL_MESSAGES_HEARTBEAT_KEY], MESSAGES_STALE_MIN),
      mkItem('poll_comments', 'Quét bình luận (10 phút/lần)', map[FB_POLL_COMMENTS_HEARTBEAT_KEY], COMMENTS_STALE_MIN),
    ],
  };
}

// ─── Nhóm 3: Bot Zalo (gửi thông báo) ─────────────────────────────────────────
async function zaloGroup(companyId: string): Promise<HealthGroup> {
  const service = createServiceClient();
  const { data: row } = await service
    .from('zalo_bot_sessions')
    .select('status, display_name, last_error, connected_at')
    .eq('company_id', companyId)
    .maybeSingle();

  const r = row as { status?: string; display_name?: string | null; last_error?: string | null } | null;
  let item: HealthItem;
  if (!r || r.status !== 'connected') {
    item = {
      key: 'zalo_bot', label: 'Bot Zalo gửi thông báo', status: 'fail',
      detail: r?.last_error ? `Mất kết nối: ${r.last_error}` : 'Chưa kết nối tài khoản Zalo.',
      fix: 'Lead vẫn được lưu nhưng KHÔNG có tin báo về nhóm Zalo. Vào Cài đặt → Thông báo, quét lại mã QR để đăng nhập bot Zalo.',
    };
  } else {
    item = { key: 'zalo_bot', label: 'Bot Zalo gửi thông báo', status: 'ok', detail: `Đang kết nối${r.display_name ? ` (${r.display_name})` : ''}.` };
  }
  return { title: 'Bot Zalo', items: [item] };
}

// ─── Nhóm 4: Hàng đợi thông báo ───────────────────────────────────────────────
async function notifGroup(companyId: string): Promise<HealthGroup> {
  const service = createServiceClient();
  const { data: chRows } = await service
    .from('notification_channels')
    .select('id')
    .eq('company_id', companyId);
  const chIds = ((chRows ?? []) as { id: string }[]).map((r) => r.id);
  if (chIds.length === 0) {
    return { title: 'Hàng đợi thông báo', items: [{ key: 'notif', label: 'Nhóm Zalo nhận thông báo', status: 'warn', detail: 'Chưa cấu hình nhóm Zalo nào để nhận thông báo lead.', fix: 'Vào Cài đặt → Thông báo để gắn nhóm Zalo cho từng phòng bán hàng.' }] };
  }

  const stuckBefore = new Date(Date.now() - NOTIF_STUCK_MIN * 60000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 3600000).toISOString();

  const [{ count: stuck }, { count: failed }] = await Promise.all([
    service.from('notifications').select('id', { count: 'exact', head: true })
      .in('channel_id', chIds).eq('status', 'pending').lt('created_at', stuckBefore),
    service.from('notifications').select('id', { count: 'exact', head: true })
      .in('channel_id', chIds).eq('status', 'failed').gte('created_at', dayAgo),
  ]);

  const items: HealthItem[] = [];
  if ((stuck ?? 0) > 0) {
    items.push({ key: 'notif_stuck', label: 'Tin báo đang kẹt', status: 'fail',
      detail: `${stuck} tin chờ gửi quá ${NOTIF_STUCK_MIN} phút.`,
      fix: 'Bot Zalo có thể đã ngắt → tin không gửi được. Vào Cài đặt → Thông báo, quét lại QR đăng nhập bot Zalo.' });
  }
  if ((failed ?? 0) > 0) {
    items.push({ key: 'notif_failed', label: 'Tin báo gửi lỗi (24h)', status: 'warn',
      detail: `${failed} tin gửi lỗi trong 24 giờ qua.`,
      fix: 'Kiểm tra bot Zalo còn đăng nhập và còn trong nhóm nhận thông báo không.' });
  }
  if (items.length === 0) {
    items.push({ key: 'notif', label: 'Hàng đợi thông báo', status: 'ok', detail: 'Không có tin kẹt hay lỗi — thông báo chạy bình thường.' });
  }
  return { title: 'Hàng đợi thông báo', items };
}

/** Tổng hợp toàn bộ sức khoẻ hệ thống cho 1 công ty. */
export async function gatherSystemHealth(companyId: string): Promise<SystemHealth> {
  const groups = await Promise.all([
    facebookGroup(companyId),
    pollGroup(),
    zaloGroup(companyId),
    notifGroup(companyId),
  ]);
  const allItems = groups.flatMap((g) => g.items);
  return { overall: worst(allItems), groups, generatedAt: new Date().toISOString() };
}
