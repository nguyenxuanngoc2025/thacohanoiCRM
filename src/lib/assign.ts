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
