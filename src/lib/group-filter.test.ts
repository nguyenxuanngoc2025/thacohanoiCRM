import { describe, it, expect } from 'vitest';
import { filterGroups } from './group-filter';

const groups = [
  { id: '111', name: 'Phòng Tải Bus — Đài Tư' },
  { id: '222', name: 'KIA Long Biên' },
  { id: '333', name: 'Mazda Giải Phóng' },
];

describe('filterGroups', () => {
  it('query rỗng → trả nguyên danh sách', () => {
    expect(filterGroups(groups, '')).toHaveLength(3);
  });
  it('lọc theo tên không phân biệt hoa thường', () => {
    expect(filterGroups(groups, 'kia').map((g) => g.id)).toEqual(['222']);
  });
  it('lọc bỏ dấu tiếng Việt', () => {
    expect(filterGroups(groups, 'dai tu').map((g) => g.id)).toEqual(['111']);
  });
  it('lọc theo id', () => {
    expect(filterGroups(groups, '333').map((g) => g.id)).toEqual(['333']);
  });
});
