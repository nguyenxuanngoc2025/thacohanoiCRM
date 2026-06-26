# Bù tên Zalo cho lead khuyết tên — Design

**Ngày:** 2026-06-26
**Trạng thái:** Đã chốt với user, chờ viết plan.

## Vấn đề

Nhiều lead Facebook khách không để lại tên (hoặc tên là tiêu đề form, vd
`nhận_báo_giá_lăn_bánh_kia_`). Tên rác làm khó nhận diện khách trong tin nhóm
Zalo lẫn danh sách lead. Tài khoản bot Zalo (zca-js) có hàm `findUser(phone)` →
nếu SĐT có tài khoản Zalo thì trả tên hiển thị. Dùng tên này bù cho lead khuyết tên.

## Quyết định đã chốt

1. **Khi nào tra:** CHỈ khi tên lead không phải tên người (hướng A). Tên trông
   giống tên người (kể cả biệt danh "Lão Già") → GIỮ NGUYÊN, không tra, không ghi đè.
2. **Hiển thị:** thay luôn tên hiển thị bằng tên Zalo (ghi vào `leads.full_name`),
   giữ tên gốc trong `lead_logs` để đối chiếu.
3. **Thứ tự:** tra tên TRƯỚC, rồi mới báo nhóm → tin "LEAD MỚI" hiện tên thật.
4. **KHÔNG bù lead cũ:** lead đã gửi nhóm rồi là chính thức, không gửi lại.
   Chỉ áp dụng lead MỚI từ giờ.
5. **Cập nhật app:** tên tra được ghi `leads.full_name` → tự hiện trong danh sách lead.

## Kiến trúc (hướng 1 — tra trong bot, trước khi gửi)

Chỉ bot VPS có phiên Zalo → mọi việc tra cứu gom ở bot. App CRM chỉ đánh dấu lead
nào cần tra.

### Quy tắc nhận diện "không phải tên người" — `looksLikePersonName(name)`
Coi là **cần tra** (tên xấu) khi `full_name`:
- Trống / null
- Bằng "Khách lẻ" / "Khách hàng" (so sánh không phân biệt hoa thường, đã trim)
- Chứa dấu gạch dưới `_` (dạng slug form)
- Chứa từ khoá marketing (không dấu/có dấu, lowercase): `báo giá`, `bao gia`,
  `lăn bánh`, `lan banh`, `khuyến mãi`, `khuyen mai`, `nhận`, `nhan`, `đăng ký`,
  `dang ky`, `form`
- Ngược lại → coi là tên người, GIỮ NGUYÊN.

Helper đặt trong app CRM (`lib/`) có unit test thuần; dùng tại `ingestLead`.

### Luồng lead mới
1. **App `ingestLead`:** sau khi tạo lead + chọn kênh `new_lead` như hiện tại.
   - Render `text` như cũ (tên hiện có, đã mask SĐT).
   - Nếu `!looksLikePersonName(full_name)` → payload thông báo kèm khối
     `enrich: { leadId, phone, badName }`. (phone = SĐT đầy đủ, KHÔNG mask — bot cần
     để tra; SĐT đầy đủ chỉ nằm trong payload nội bộ, tin gửi nhóm vẫn mask.)
   - Nếu tên ổn → không kèm `enrich` (hành vi hiện tại).
2. **Bot VPS, trước khi gửi tin `new_lead`:** nếu payload có `enrich`:
   - Gọi `api.findUser(enrich.phone)`.
   - **Tìm thấy tên:** `UPDATE leads SET full_name=<tên Zalo> WHERE id=enrich.leadId`
     (chỉ ghi đè nếu tên hiện tại vẫn = badName, tránh đè tay người vừa sửa) +
     `INSERT lead_logs (type='system', content='Bù tên từ Zalo: <cũ> → <mới>')`.
     Thay tên trong `text`: đổi đúng đoạn `badName` trong dòng "KH:" thành tên Zalo.
     Gửi tin nhóm với tên thật.
   - **Không thấy / SĐT ẩn / lỗi:** giữ `text` gốc, ghi log nhẹ "không có Zalo",
     gửi tin như cũ. KHÔNG retry tra (1 lần/lead).
3. App đọc `leads.full_name` → danh sách lead tự hiện tên mới.

### An toàn tài khoản bot
- `findUser` CHỈ chạy cho lead tên-xấu (số lượng ít).
- Đi theo nhịp gửi sẵn có (1 tin/nhịp 45-90s) → tần suất `findUser` ≤ tần suất gửi.
- 1 lần tra/lead (không retry) → không spam Zalo.

## Phạm vi loại trừ (YAGNI)
- KHÔNG bù lead cũ (đã chốt).
- KHÔNG nút "Tra Zalo" thủ công (hướng C) — thêm sau nếu cần.
- KHÔNG lấy avatar — chỉ lấy tên.
- KHÔNG áp cho event `overdue`/`daily_report` — chỉ `new_lead` (lúc lead mới về).

## Test
- `looksLikePersonName`: unit test các case (trống, "Khách lẻ", slug gạch dưới,
  từ khoá marketing, tên người thật, biệt danh) — thuần, trong app CRM.
- Bot: test thủ công 1 lead tên-xấu SĐT có Zalo → xác nhận tin nhóm hiện tên thật +
  `leads.full_name` cập nhật + `lead_logs` ghi đổi tên. 1 lead SĐT không Zalo →
  gửi tin tên gốc, không lỗi.

## File dự kiến đụng
- App CRM: `src/lib/person-name.ts` (+ test) — helper `looksLikePersonName`.
- App CRM: `src/lib/ingest.ts` — kèm `enrich` vào payload khi tên xấu.
- Bot VPS: `/opt/zca-bot/index.mjs` — xử lý `enrich` trước khi gửi `new_lead`
  (findUser + update leads + lead_logs + thay tên trong text). Deploy thủ công lên VPS.
