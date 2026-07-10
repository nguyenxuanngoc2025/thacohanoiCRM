import { describe, it, expect, beforeAll } from 'vitest';
import { extractGroupIds, parseStyledText, encrypt, decrypt, maybeEnrich, runEnrichOnly } from './lib.mjs';

beforeAll(() => { process.env.TOKEN_ENC_KEY = 'test-key-123'; });

describe('extractGroupIds', () => {
  it('lấy id từ mảng id thuần', () => {
    expect(extractGroupIds(['111', '222'])).toEqual(['111', '222']);
  });
  it('lấy key từ gridVerMap (object)', () => {
    expect(extractGroupIds({ gridVerMap: { '111': 3, '222': 1 } }).sort()).toEqual(['111', '222']);
  });
  it('lấy key từ gridInfoMap (object)', () => {
    expect(extractGroupIds({ gridInfoMap: { '900': {} } })).toEqual(['900']);
  });
  it('lấy id từ groups là mảng object', () => {
    expect(extractGroupIds({ groups: [{ groupId: 'abc' }, { id: 'def' }] })).toEqual(['abc', 'def']);
  });
  it('rỗng/không hợp lệ → mảng rỗng', () => {
    expect(extractGroupIds(null)).toEqual([]);
    expect(extractGroupIds({})).toEqual([]);
  });
});

describe('parseStyledText', () => {
  it('đổi <b> → style đậm và bỏ tag', () => {
    const { msg, styles } = parseStyledText('Xin <b>chào</b> bạn');
    expect(msg).toBe('Xin chào bạn');
    expect(styles).toEqual([{ start: 4, len: 4, st: expect.anything() }]);
  });
  it('không có tag → giữ nguyên, styles rỗng', () => {
    const { msg, styles } = parseStyledText('SĐT 0901234*** an toàn');
    expect(msg).toBe('SĐT 0901234*** an toàn');
    expect(styles).toEqual([]);
  });
  it('tag lẻ không đóng → giữ nguyên ký tự', () => {
    const { msg } = parseStyledText('a <b>b');
    expect(msg).toBe('a <b>b');
  });
});

// Mock db (chainable) + api.findUser cho test tra tên Zalo.
function makeDb(lead) {
  const updates = [];
  const logs = [];
  const db = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: table === 'leads' ? lead : null }),
        update(patch) { return { eq: async () => { if (table === 'leads') updates.push(patch); } }; },
        insert: async (row) => { if (table === 'lead_logs') logs.push(row); },
      };
    },
  };
  return { db, updates, logs };
}
const apiWith = (name) => ({ findUser: async () => (name ? { display_name: name } : null) });
const enrichPayload = (overrides = {}) => ({
  payload: { enrich: { leadId: 'L1', phone: '+84981515513', badName: 'Khách lẻ', ...overrides } },
});

describe('runEnrichOnly (tra tên độc lập)', () => {
  it('có tên Zalo + chưa khoá + tên rác → ghi tên + đóng dấu name_enriched_at', async () => {
    const { db, updates, logs } = makeDb({ full_name: 'Khách lẻ', name_locked: false });
    await runEnrichOnly(db, apiWith('Ngọc Nguyễn'), enrichPayload());
    expect(updates.some((u) => u.full_name === 'Ngọc Nguyễn' && u.name_enriched_at)).toBe(true);
    expect(logs.some((l) => /Ngọc Nguyễn/.test(l.content))).toBe(true);
  });

  it('user đã khoá tên → KHÔNG ghi đè, chỉ đóng dấu đã thử', async () => {
    const { db, updates } = makeDb({ full_name: 'Tên user tự đặt', name_locked: true });
    await runEnrichOnly(db, apiWith('Ngọc Nguyễn'), enrichPayload());
    expect(updates.some((u) => 'full_name' in u)).toBe(false);
    expect(updates.some((u) => u.name_enriched_at)).toBe(true);
  });

  it('SĐT không có Zalo → chỉ đóng dấu đã thử (tránh tra lại)', async () => {
    const { db, updates } = makeDb({ full_name: 'Khách lẻ', name_locked: false });
    await runEnrichOnly(db, apiWith(null), enrichPayload());
    expect(updates.some((u) => 'full_name' in u)).toBe(false);
    expect(updates.some((u) => u.name_enriched_at)).toBe(true);
  });
});

describe('maybeEnrich (thay tên trong text trước khi gửi)', () => {
  it('thay badName trong text bằng tên Zalo', async () => {
    const { db } = makeDb({ full_name: 'Khách lẻ', name_locked: false });
    const n = { payload: { text: 'Lead mới: Khách lẻ', enrich: { leadId: 'L1', phone: '+84981515513', badName: 'Khách lẻ' } } };
    const out = await maybeEnrich(db, apiWith('Ngọc Nguyễn'), n);
    expect(out).toBe('Lead mới: Ngọc Nguyễn');
  });

  it('không có payload.enrich → giữ nguyên text', async () => {
    const { db } = makeDb({ full_name: 'x', name_locked: false });
    const out = await maybeEnrich(db, apiWith('Y'), { payload: { text: 'giữ nguyên' } });
    expect(out).toBe('giữ nguyên');
  });
});

describe('crypto round-trip', () => {
  it('encrypt rồi decrypt ra đúng chuỗi gốc', () => {
    const plain = JSON.stringify({ cookie: 'abc', imei: 'xyz', tiếng: 'Việt' });
    const blob = encrypt(plain);
    expect(blob.split('.').length).toBe(3);
    expect(decrypt(blob)).toBe(plain);
  });
  it('blob hỏng → ném lỗi', () => {
    expect(() => decrypt('khong-hop-le')).toThrow();
  });
});
