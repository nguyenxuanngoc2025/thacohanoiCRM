import { describe, it, expect } from 'vitest';
import { matchProvinceShowrooms, type ProvinceShowroom } from './route-province';

const SR: ProvinceShowroom[] = [
  { id: 'dt', province: 'Hà Nội', province_aliases: ['ha noi', 'hn', 'thu do'] },
  { id: 'gp', province: 'Hà Nội', province_aliases: ['ha noi', 'hn'] },
  { id: 'cm', province: 'Hà Nội', province_aliases: [] },
  { id: 'nb', province: 'Ninh Bình', province_aliases: ['ninh binh'] },
  { id: 'hnam', province: 'Hà Nam', province_aliases: ['ha nam'] },
  { id: 'nostate', province: null, province_aliases: null },
];

describe('matchProvinceShowrooms', () => {
  it('địa chỉ Ninh Bình → chỉ showroom Ninh Bình', () => {
    expect(matchProvinceShowrooms('Xã ABC, Ninh Bình', SR)).toEqual(['nb']);
  });

  it('địa chỉ Hà Nội → TẤT CẢ showroom Hà Nội (để máy tự chia)', () => {
    expect(matchProvinceShowrooms('Quận Cầu Giấy, Hà Nội', SR).sort()).toEqual(['cm', 'dt', 'gp']);
  });

  it('khớp không dấu / viết tắt', () => {
    expect(matchProvinceShowrooms('so 1 pho X, ha noi', SR).sort()).toEqual(['cm', 'dt', 'gp']);
    expect(matchProvinceShowrooms('TP HN', SR).sort()).toEqual(['cm', 'dt', 'gp']);
  });

  it('phân biệt Hà Nội với Hà Nam', () => {
    expect(matchProvinceShowrooms('Phủ Lý, Hà Nam', SR)).toEqual(['hnam']);
  });

  it('địa chỉ trống → không khớp (để lùi về mặc định)', () => {
    expect(matchProvinceShowrooms('', SR)).toEqual([]);
    expect(matchProvinceShowrooms(null, SR)).toEqual([]);
    expect(matchProvinceShowrooms('   ', SR)).toEqual([]);
  });

  it('địa chỉ không nhận ra tỉnh nào → không khớp', () => {
    expect(matchProvinceShowrooms('Đà Nẵng', SR)).toEqual([]);
  });

  it('nhiều tỉnh cùng xuất hiện → chọn tỉnh có khoá khớp DÀI NHẤT', () => {
    // "ninh binh" (9) dài hơn "ha noi" (6) → ưu tiên Ninh Bình.
    expect(matchProvinceShowrooms('Gửi từ Hà Nội về Ninh Bình', SR)).toEqual(['nb']);
  });

  it('bỏ qua showroom chưa gán tỉnh', () => {
    const only = [{ id: 'x', province: null, province_aliases: null }];
    expect(matchProvinceShowrooms('Hà Nội', only)).toEqual([]);
  });
});
