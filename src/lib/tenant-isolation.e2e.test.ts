import { describe, it, expect } from 'vitest';
import { parseHost } from './tenant';
import { pickByStrategy, type AssignStrategy, type StrategyCandidate } from './assign';
import { isShowroomQuotaReached, disallowedBrandIds } from './quota';

/**
 * E2E TÁCH BIỆT CÔNG TY (multi-tenant isolation).
 * Cùng 1 hệ thống phục vụ nhiều công ty Thaco Auto qua subdomain/domain.
 * Bộ test này dựng 2 công ty giả (Hà Nội + Đà Nẵng) có dữ liệu KHÁC nhau và
 * chứng minh: thao tác trên công ty A không bao giờ đọc/ghi/định tuyến chạm
 * dữ liệu công ty B — và mỗi công ty giữ cấu hình riêng độc lập.
 *
 * 5 bề mặt tách biệt được phủ:
 *  A. Resolve tenant theo Host (parseHost — hàm thật)
 *  B. Guard chặn user đăng nhập SAI tenant (mô phỏng điều kiện layout dashboard)
 *  C. Cấu hình settings scoped theo company_id (mô phỏng .eq('company_id'))
 *  D. Cascade phân giao chỉ chọn trong showroom/phòng/TVBH của ĐÚNG công ty
 *  E. Quota & brand whitelist riêng từng công ty (hàm thật quota.ts)
 */

const PLATFORM = 'crmthacoauto.com';
const HN = 'company-hanoi';
const DN = 'company-danang';

// ───────────────────────── A. Resolve tenant theo Host ─────────────────────────
describe('A. Resolve tenant — mỗi Host ra đúng 1 công ty', () => {
  it('subdomain khác nhau → khóa tra công ty khác nhau', () => {
    expect(parseHost('hanoi.crmthacoauto.com', PLATFORM)).toEqual({ kind: 'subdomain', sub: 'hanoi' });
    expect(parseHost('danang.crmthacoauto.com', PLATFORM)).toEqual({ kind: 'subdomain', sub: 'danang' });
  });
  it('custom domain riêng → tra theo domain đó (không lẫn subdomain)', () => {
    expect(parseHost('crm.thacoautohn-mkt.com', PLATFORM)).toEqual({ kind: 'custom', host: 'crm.thacoautohn-mkt.com' });
  });
  it('apex nền tảng → root (rơi về công ty mặc định, không phải 1 tenant cụ thể)', () => {
    expect(parseHost('crmthacoauto.com', PLATFORM)).toEqual({ kind: 'root' });
  });
});

// ───────────────────────── B. Guard chặn sai tenant ─────────────────────────
// Mô phỏng nguyên văn điều kiện trong (dashboard)/layout.tsx:
//   if (profile?.company_id && profile.company_id !== tenant.id) -> chặn
// platform_owner có company_id = null → KHÔNG bị chặn (cross-company).
function isWrongTenant(profileCompanyId: string | null, tenantId: string): boolean {
  return !!profileCompanyId && profileCompanyId !== tenantId;
}

describe('B. Guard chặn user đăng nhập sai tenant', () => {
  it('user HN truy cập host của Đà Nẵng → bị chặn', () => {
    expect(isWrongTenant(HN, DN)).toBe(true);
  });
  it('user HN truy cập đúng host HN → cho qua', () => {
    expect(isWrongTenant(HN, HN)).toBe(false);
  });
  it('Chủ nền tảng (company_id null) → qua mọi tenant', () => {
    expect(isWrongTenant(null, HN)).toBe(false);
    expect(isWrongTenant(null, DN)).toBe(false);
  });
});

// ───────────────────────── C. Settings scoped theo công ty ─────────────────────────
// Mô phỏng kho cấu hình + đọc/ghi luôn lọc company_id (mọi route admin/đọc settings
// đều .eq('company_id', companyId)). Chứng minh A và B giữ giá trị KHÁC nhau song song.
interface SlaRow { company_id: string; round: number; first_response_hours: number }
class ScopedSettings {
  private rows: SlaRow[] = [];
  // upsert theo (company_id, round) — đúng onConflict của sla route
  upsert(companyId: string, round: number, hours: number) {
    const r = this.rows.find((x) => x.company_id === companyId && x.round === round);
    if (r) r.first_response_hours = hours;
    else this.rows.push({ company_id: companyId, round, first_response_hours: hours });
  }
  read(companyId: string, round: number): number | null {
    return this.rows.find((x) => x.company_id === companyId && x.round === round)?.first_response_hours ?? null;
  }
}

describe('C. Cấu hình SLA tách biệt từng công ty', () => {
  it('đổi SLA của HN KHÔNG ảnh hưởng Đà Nẵng', () => {
    const s = new ScopedSettings();
    s.upsert(HN, 1, 2);
    s.upsert(DN, 1, 8);
    s.upsert(HN, 1, 5); // HN đổi lại 5h
    expect(s.read(HN, 1)).toBe(5);
    expect(s.read(DN, 1)).toBe(8); // Đà Nẵng giữ nguyên
  });
  it('công ty CHƯA cấu hình → đọc ra null (UI mới hiển thị mặc định), không lấy của công ty khác', () => {
    const s = new ScopedSettings();
    s.upsert(HN, 1, 2);
    expect(s.read(DN, 1)).toBeNull();
  });
});

// ───────────────────────── D. Cascade chỉ trong đúng công ty ─────────────────────────
// Mô phỏng ingest.ts: candidate showrooms LẤY TỪ kênh (channel) thuộc 1 công ty,
// nên pool luôn bị giới hạn trong công ty của lead. Dựng "thế giới" 2 công ty và
// chứng minh route(A) không bao giờ trả id của B + đổi cấu hình A không đổi kết quả B.
interface SrNode { id: string; company_id: string; teamId: string; tvbhId: string; activeLeadCount: number }
interface World { companyStrategy: Record<string, AssignStrategy>; showrooms: SrNode[] }

function routeForCompany(world: World, companyId: string): { showroomId: string | null; teamId: string | null; tvbhId: string | null } {
  const pool = world.showrooms.filter((s) => s.company_id === companyId); // <-- khóa công ty
  const cands: StrategyCandidate[] = pool.map((s) => ({ id: s.id, activeLeadCount: s.activeLeadCount, sharePct: 0, lastAssignedAt: null }));
  const chosen = pickByStrategy(world.companyStrategy[companyId] ?? 'least_loaded', cands);
  const sr = pool.find((s) => s.id === chosen) ?? null;
  return { showroomId: sr?.id ?? null, teamId: sr?.teamId ?? null, tvbhId: sr?.tvbhId ?? null };
}

describe('D. Cascade phân giao bị khóa trong đúng công ty', () => {
  const world: World = {
    companyStrategy: { [HN]: 'least_loaded', [DN]: 'least_loaded' },
    showrooms: [
      { id: 'hn-sr1', company_id: HN, teamId: 'hn-t1', tvbhId: 'hn-u1', activeLeadCount: 3 },
      { id: 'hn-sr2', company_id: HN, teamId: 'hn-t2', tvbhId: 'hn-u2', activeLeadCount: 1 },
      { id: 'dn-sr1', company_id: DN, teamId: 'dn-t1', tvbhId: 'dn-u1', activeLeadCount: 0 }, // ít lead nhất TOÀN hệ thống
    ],
  };
  it('lead của HN không bao giờ định tuyến sang showroom/phòng/TVBH của Đà Nẵng', () => {
    const r = routeForCompany(world, HN);
    expect(r).toEqual({ showroomId: 'hn-sr2', teamId: 'hn-t2', tvbhId: 'hn-u2' });
    // dù dn-sr1 ít lead hơn (0 < 1), cascade HN KHÔNG chọn nó.
    expect(r.showroomId?.startsWith('dn-')).toBe(false);
  });
  it('lead của Đà Nẵng chỉ chọn trong showroom Đà Nẵng', () => {
    const r = routeForCompany(world, DN);
    expect(r).toEqual({ showroomId: 'dn-sr1', teamId: 'dn-t1', tvbhId: 'dn-u1' });
  });
  it('đổi chiến lược công ty HN KHÔNG đổi kết quả định tuyến của Đà Nẵng', () => {
    const before = routeForCompany(world, DN);
    const mutated: World = { ...world, companyStrategy: { ...world.companyStrategy, [HN]: 'round_robin' } };
    const after = routeForCompany(mutated, DN);
    expect(after).toEqual(before);
  });
});

// ───────────────────────── E. Quota & brand whitelist riêng ─────────────────────────
describe('E. Quota showroom & brand whitelist độc lập từng công ty', () => {
  it('mỗi công ty có trần showroom riêng — chạm trần ở A không khóa B', () => {
    // HN gói 3 showroom đã dùng 3 (chạm trần); DN gói 5 dùng 2 (còn chỗ).
    expect(isShowroomQuotaReached(3, 3)).toBe(true);  // HN
    expect(isShowroomQuotaReached(2, 5)).toBe(false); // DN
  });
  it('brand whitelist khác nhau — brand hợp lệ ở công ty này có thể bị chặn ở công ty kia', () => {
    const hnAllowed = ['kia', 'mazda', 'bmw'];
    const dnAllowed = ['kia', 'mazda'];
    expect(disallowedBrandIds(['bmw'], hnAllowed)).toEqual([]);      // HN được phép BMW
    expect(disallowedBrandIds(['bmw'], dnAllowed)).toEqual(['bmw']); // DN KHÔNG được phép BMW
  });
});
