/**
 * Nhãn "chi tiết kênh" hiển thị cho cột Nguồn của lead.
 * Facebook tách 3 chi tiết: Lead Ads / Tin nhắn / Bình luận.
 * Kênh khác (zalo, website…) chưa có chi tiết riêng → viết hoa chữ cái đầu.
 */
const SOURCE_LABELS: Record<string, string> = {
  facebook: 'Lead Ads',
  fb_message: 'Tin nhắn',
  fb_comment: 'Bình luận',
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return '—';
  const known = SOURCE_LABELS[source];
  if (known) return known;
  return source.charAt(0).toUpperCase() + source.slice(1);
}
