import { describe, it, expect } from 'vitest';
import { pickByStrategy } from './assign';

/**
 * E2E phân giao theo tỷ trọng (weighted) + mốc hiệu lực (assign_effective_from).
 *
 * Mô phỏng NGUYÊN VĂN vòng đếm tải của ingest.ts: với mỗi lead mới, đếm tải hiện tại
 * của từng nơi rồi gọi hàm THẬT pickByStrategy('weighted', ...) để chọn — KHÔNG chạm DB
 * (chỉ có 1 Supabase dùng chung mọi dự án nên không chạy E2E thật lên prod).
 *
 * ingest đếm lead theo cửa sổ `created_at >= assign_effective_from`. Ta mô hình mỗi nơi
 * gồm 2 phần: oldLeads (phát sinh TRƯỚC mốc) + newLeads (TỪ mốc). effectiveFrom=null đếm
 * cả hai; có mốc thì CHỈ đếm newLeads. Đây chính là phần mà bản vá tác động: trước đây
 * đổi tỷ lệ cấp 2/3 không đặt lại mốc nên oldLeads vẫn kéo lệch cân bằng.
 */

interface Node { id: string; share: number; oldLeads: number; newLeads: number }

/**
 * Nạp `count` lead lần lượt vào 1 cấp weighted.
 * windowed=true ⇒ áp mốc hiệu lực (bỏ qua oldLeads, giống sau khi reset effective_from).
 * windowed=false ⇒ đếm toàn thời gian (giống effective_from=null = bug khi đổi tỷ lệ).
 */
function feed(nodes: Node[], count: number, windowed: boolean): void {
  for (let i = 0; i < count; i++) {
    const cands = nodes.map((n) => ({
      id: n.id,
      sharePct: n.share,
      activeLeadCount: windowed ? n.newLeads : n.oldLeads + n.newLeads,
      lastAssignedAt: null,
    }));
    const chosen = pickByStrategy('weighted', cands);
    const node = nodes.find((n) => n.id === chosen);
    if (node) node.newLeads += 1;
  }
}

// Tỷ lệ thực tế (theo newLeads) của 1 node trên tổng new toàn cấp.
function newShare(nodes: Node[], id: string): number {
  const total = nodes.reduce((s, n) => s + n.newLeads, 0);
  const n = nodes.find((x) => x.id === id);
  return total > 0 ? (n?.newLeads ?? 0) / total : 0;
}

describe('E2E weighted cấp 1 — kênh → showroom đúng tỷ lệ 50/25/25', () => {
  it('chia mới khởi đầu sạch hội tụ về 2:1:1', () => {
    const nodes: Node[] = [
      { id: 'dai-tu', share: 50, oldLeads: 0, newLeads: 0 },
      { id: 'chuong-my', share: 25, oldLeads: 0, newLeads: 0 },
      { id: 'giai-phong', share: 25, oldLeads: 0, newLeads: 0 },
    ];
    feed(nodes, 200, true);
    expect(newShare(nodes, 'dai-tu')).toBeCloseTo(0.5, 1);
    expect(newShare(nodes, 'chuong-my')).toBeCloseTo(0.25, 1);
    expect(newShare(nodes, 'giai-phong')).toBeCloseTo(0.25, 1);
  });
});

describe('E2E weighted cấp 2 — showroom Đài Tư → phòng 40/30/30', () => {
  // Tình huống thật: phòng "Đài Tư" tạo trước, ôm 92 lead cũ; Phúc Đồng/Sóc Sơn tạo sau = 0.
  const start = (): Node[] => [
    { id: 'p-dai-tu', share: 40, oldLeads: 92, newLeads: 0 },
    { id: 'p-phuc-dong', share: 30, oldLeads: 0, newLeads: 0 },
    { id: 'p-soc-son', share: 30, oldLeads: 0, newLeads: 0 },
  ];

  it('BUG (không reset mốc): lead cũ kéo lệch → phòng Đài Tư bị "treo", lead mới dồn 2 phòng mới', () => {
    const nodes = start();
    feed(nodes, 60, false); // effective_from=null → đếm cả 92 lead cũ
    const daiTu = nodes.find((n) => n.id === 'p-dai-tu');
    // Đài Tư đang quá tải (92/152≈60% >> 40%) → thâm hụt âm → KHÔNG nhận lead mới nào.
    expect(daiTu?.newLeads).toBe(0);
    // 2 phòng mới chia gần đều 60 lead (share 30/30) → mỗi phòng ~30.
    expect(nodes.find((n) => n.id === 'p-phuc-dong')?.newLeads).toBeGreaterThan(25);
    expect(nodes.find((n) => n.id === 'p-soc-son')?.newLeads).toBeGreaterThan(25);
  });

  it('FIX (reset mốc): bỏ qua 92 lead cũ → lead mới chia ngay theo 40/30/30', () => {
    const nodes = start();
    feed(nodes, 100, true); // windowed = sau khi resetEffectiveFromForShowroom đặt mốc = now()
    expect(newShare(nodes, 'p-dai-tu')).toBeCloseTo(0.4, 1);
    expect(newShare(nodes, 'p-phuc-dong')).toBeCloseTo(0.3, 1);
    expect(newShare(nodes, 'p-soc-son')).toBeCloseTo(0.3, 1);
    // Phòng Đài Tư PHẢI nhận lead mới ngay (khác hẳn nhánh BUG = 0).
    expect(nodes.find((n) => n.id === 'p-dai-tu')?.newLeads).toBeGreaterThan(30);
  });

  it('so sánh trực tiếp: cùng 30 lead đầu, reset mốc cho Đài Tư nhận ~40% còn không reset nhận 0%', () => {
    const noReset = start();
    feed(noReset, 30, false);
    const withReset = start();
    feed(withReset, 30, true);
    expect(noReset.find((n) => n.id === 'p-dai-tu')?.newLeads).toBe(0);
    expect(withReset.find((n) => n.id === 'p-dai-tu')?.newLeads).toBeGreaterThan(8); // ~12 (40% của 30)
  });
});

describe('E2E weighted cấp 3 — phòng → TVBH 50/50 sau reset mốc', () => {
  it('2 TVBH share bằng nhau, 1 người ôm lead cũ → reset mốc cân bằng lại từ đầu', () => {
    const nodes: Node[] = [
      { id: 'tvbh-a', share: 50, oldLeads: 40, newLeads: 0 },
      { id: 'tvbh-b', share: 50, oldLeads: 0, newLeads: 0 },
    ];
    feed(nodes, 50, true); // reset mốc → chỉ đếm new
    expect(newShare(nodes, 'tvbh-a')).toBeCloseTo(0.5, 1);
    expect(newShare(nodes, 'tvbh-b')).toBeCloseTo(0.5, 1);
  });
});
