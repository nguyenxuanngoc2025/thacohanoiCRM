import { describe, it, expect } from 'vitest';
import { resolveIngestScope } from './ingest-scope';

describe('resolveIngestScope', () => {
  const base = { channelBrandId: 'b-chan', channelShowroomId: 'sr-anchor', junctionShowroomIds: ['sr1', 'sr2'] };

  it('không ghi đè → dùng brand kênh + showroom junction', () => {
    const r = resolveIngestScope({ ...base });
    expect(r.brandId).toBe('b-chan');
    expect(r.candidateShowroomIds).toEqual(['sr1', 'sr2']);
  });

  it('junction rỗng → fallback anchor showroom của kênh', () => {
    const r = resolveIngestScope({ ...base, junctionShowroomIds: [] });
    expect(r.candidateShowroomIds).toEqual(['sr-anchor']);
  });

  it('ghi đè brand + showroom → dùng ghi đè, bỏ qua kênh/junction', () => {
    const r = resolveIngestScope({ ...base, overrideBrandId: 'b-tab', overrideShowroomIds: ['srX'] });
    expect(r.brandId).toBe('b-tab');
    expect(r.candidateShowroomIds).toEqual(['srX']);
  });

  it('ghi đè showroom rỗng coi như không ghi đè showroom', () => {
    const r = resolveIngestScope({ ...base, overrideShowroomIds: [] });
    expect(r.candidateShowroomIds).toEqual(['sr1', 'sr2']);
  });

  it('ghi đè brand = null (kênh không hãng) được tôn trọng', () => {
    const r = resolveIngestScope({ ...base, overrideBrandId: null, hasBrandOverride: true });
    expect(r.brandId).toBeNull();
  });
});
