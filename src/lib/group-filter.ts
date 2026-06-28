export type ZaloGroup = { id: string; name: string };

/** Bỏ dấu tiếng Việt + hạ chữ thường để so khớp tìm kiếm. */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

/** Lọc group theo tên (không dấu/hoa thường) hoặc id. Query rỗng → trả nguyên. */
export function filterGroups(groups: ZaloGroup[], query: string): ZaloGroup[] {
  const q = norm(query);
  if (!q) return groups;
  return groups.filter((g) => norm(g.name).includes(q) || g.id.includes(query.trim()));
}
