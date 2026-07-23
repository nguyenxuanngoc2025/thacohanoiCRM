// Kiểm thử bộ từ khoá dò dòng xe Tải Bus (0074) — mô phỏng ĐÚNG src/lib/detect-model.ts
function normalizeForMatch(input) {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
}
const isDigit = (c) => c >= '0' && c <= '9';
function keyHit(haystack, key) {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(key, from);
    if (i < 0) return false;
    const before = i > 0 ? haystack[i - 1] : '';
    const after = i + key.length < haystack.length ? haystack[i + key.length] : '';
    const beforeOk = !(isDigit(key[0]) && isDigit(before));
    const afterOk = !(isDigit(key[key.length - 1]) && isDigit(after));
    if (beforeOk && afterOk) return true;
    from = i + 1;
  }
}
function detectModel(text, models) {
  const haystack = normalizeForMatch(text);
  if (!haystack) return null;
  const matched = [];
  for (const m of models) {
    const keys = [m.name, ...m.keywords].map(normalizeForMatch).filter((k) => k.length > 0);
    if (keys.some((k) => keyHit(haystack, k))) matched.push(m.name);
  }
  return matched.length === 1 ? matched[0] : (matched.length === 0 ? null : `AMBIGUOUS[${matched.join('|')}]`);
}

const models = [
  { name: 'Tải Van', keywords: ['thacohanoi van','lăn bánh van','lái thử van','đăng ký van','thử van','towner v','van điện'] },
  { name: 'Tải nhẹ máy xăng', keywords: ['towner800','lăn bánh tf','tf230','thacohanoi tf230','thông tin tf','tf220230','towner990','lái thử tf','tf220','thacohanoi tf220','towner t','towner tải'] },
  { name: 'Tải nhẹ máy dầu', keywords: ['thacohanoi kia','k250l','k200','k200l','lăn bánh kia','k250','lái thử kia','frontier','kia frontier','k200s','k200sd'] },
  { name: 'Tải trung - Ben trung', keywords: ['linker','canter','fuso','forland','auman c240','auman c160','tf2800','tf4.9','tf7.5','tf8.5','fa140','fi170','fj285','fd120','fd490','fd600','fd700','fd150'] },
  { name: 'Đầu kéo - Tải nặng - Ben nặng', keywords: ['sinotruk','auman est','auman etx','auman gtl','auman c300','auman c340','smrm','đầu kéo','rơ moóc'] },
  { name: 'Bus', keywords: [] },
  { name: 'Mini Bus', keywords: [] },
];

// A) từ khoá tổng quát
const cases = [
  ['Cho em hỏi Towner Van 5 chỗ giá bao nhiêu', 'Tải Van'],
  ['Towner V5', 'Tải Van'],
  ['báo giá Towner V2.5-5S', 'Tải Van'],
  ['Towner V2.3-2S', 'Tải Van'],
  ['xe VAN điện', 'Tải Van'],
  ['Towner tải T2.5-2.8', 'Tải nhẹ máy xăng'],
  ['xe Towner 800', 'Tải nhẹ máy xăng'],
  ['cần mua TF230', 'Tải nhẹ máy xăng'],
  ['Towner', null],
  ['Kia Frontier K250', 'Tải nhẹ máy dầu'],
  ['K200SD-4WD.E5', 'Tải nhẹ máy dầu'],
  ['K250L.E5', 'Tải nhẹ máy dầu'],
  ['Canter TF7.5', 'Tải trung - Ben trung'],
  ['LINKER S T5.0-3.6 AMT', 'Tải trung - Ben trung'],
  ['Fuso FI170', 'Tải trung - Ben trung'],
  ['Forland FD120A', 'Tải trung - Ben trung'],
  ['Auman C240', 'Tải trung - Ben trung'],
  ['báo giá Sinotruk 6x4', 'Đầu kéo - Tải nặng - Ben nặng'],
  ['Auman EST C300', 'Đầu kéo - Tải nặng - Ben nặng'],
  ['SMRM Xương', 'Đầu kéo - Tải nặng - Ben nặng'],
  ['xe đầu kéo', 'Đầu kéo - Tải nặng - Ben nặng'],
  ['Auman', null],
  ['0912345678', null],
];

// B) ĐÁP ÁN FORM THẬT của 6 lead null-model (dò lại theo trường "dòng xe")
const realForm = [
  ['86b28537 Nhân Đơi Công', 'nhận_báo_giá_lăn_bánh_kia_', 'Tải nhẹ máy dầu'],
  ['33e7521d Trịnh Ký', 'nhận_thông_tin_lăn_bánh_tf220/230', 'Tải nhẹ máy xăng'],
  ['6e9a6edd Thanh Mai', 'nhận_thông_tin_lăn_bánh_ben', null],
  ['dc11f7af Văn Sáu', 'nhận_báo_giá_lăn_bánh_kia_', 'Tải nhẹ máy dầu'],
  ['2b2808d1 Cô Bình', 'Dạ 0325598160 em gửi ạ', null],
  ['58bee99e Tăng Hà', '', null],
];

let fail = 0;
console.log('== A) Tu khoa tong quat ==');
for (const [text, expect] of cases) {
  const got = detectModel(text, models);
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'FAIL'} | "${text}" -> ${got}  (mong: ${expect})`);
}
console.log('\n== B) Dap an form 6 lead null-model ==');
for (const [who, text, expect] of realForm) {
  const got = detectModel(text, models);
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'FAIL'} | ${who}: "${text}" -> ${got ?? 'KHONG DOAN'}  (mong: ${expect ?? 'KHONG DOAN'})`);
}
console.log(fail === 0 ? '\nTẤT CẢ ĐẠT' : `\nCÓ ${fail} CA SAI`);
process.exit(fail === 0 ? 0 : 1);
