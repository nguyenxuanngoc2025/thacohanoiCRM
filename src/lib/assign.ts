export interface AssigneeLoad {
  id: string;
  activeLeadCount: number;
}

/** Phan giao luan phien deu: chon TVBH it lead nhat trong showroom; hoa → id nho nhat. */
export function pickNextAssignee(candidates: AssigneeLoad[]): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((x, y) =>
    x.activeLeadCount !== y.activeLeadCount
      ? x.activeLeadCount - y.activeLeadCount
      : x.id.localeCompare(y.id)
  );
  return sorted[0].id;
}

export interface WeightedLoad {
  id: string;
  weight: number;        // trọng số phân bổ (cùng kênh)
  activeLeadCount: number; // số lead đang active của phòng này TRONG cùng kênh
}

/**
 * Chia theo tỷ trọng (weighted round-robin theo thâm hụt): chọn phòng "thiếu" nhiều nhất
 * so với tỷ lệ mục tiêu. weight bằng nhau ⇒ hành vi = chia đều theo số lượng.
 * Tỷ lệ luôn tính trong cùng 1 kênh (caller chỉ truyền load của kênh đó).
 */
export function pickWeightedTeam(candidates: WeightedLoad[]): string | null {
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((s, c) => s + (c.weight > 0 ? c.weight : 0), 0);
  const totalLeads = candidates.reduce((s, c) => s + c.activeLeadCount, 0);
  // Không có trọng số dương → coi như chia đều theo số lượng.
  if (totalWeight <= 0) {
    return pickNextAssignee(candidates.map((c) => ({ id: c.id, activeLeadCount: c.activeLeadCount })));
  }
  const scored = candidates.map((c) => {
    const target = (c.weight > 0 ? c.weight : 0) / totalWeight;
    const actual = totalLeads > 0 ? c.activeLeadCount / totalLeads : 0;
    return { id: c.id, deficit: target - actual };
  });
  scored.sort((x, y) =>
    x.deficit !== y.deficit ? y.deficit - x.deficit : x.id.localeCompare(y.id)
  );
  return scored[0].id;
}
