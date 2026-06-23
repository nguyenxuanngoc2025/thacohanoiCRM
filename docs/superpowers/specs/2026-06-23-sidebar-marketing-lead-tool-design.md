# Sidebar & định vị lại — Công cụ Marketing theo dõi lead

**Ngày:** 2026-06-23
**Trạng thái:** Đã chốt hướng với user (đề xuất 1 + 2)

## Bối cảnh — định vị lại sản phẩm

CRM này KHÔNG phải phần mềm bán hàng đầy đủ. Showroom đã có **phần mềm CRM nội bộ riêng** nơi TVBH nhập chi tiết giao dịch. Công cụ này phục vụ **Marketing**, chỉ trả lời 2 câu hỏi:

1. Lead về rồi — **đã được liên hệ chưa?**
2. Nếu đã liên hệ — **phân loại là gì?**

→ Bỏ mọi tính năng kiểu sales-CRM (lịch hẹn, chăm sóc dài hạn). IA phải tối giản.

## Quyết định 1 — Sidebar rút gọn

Sidebar chính (`NAV_ITEMS` trong `src/lib/nav.ts`) còn **3 mục cốt lõi**:

| Mục | href | Vai trò thấy |
|---|---|---|
| Lead | `/leads` | admin, manager, tvbh |
| Phân giao | `/assign` | admin, manager |
| Báo cáo | `/reports` | admin, manager |

- **Bỏ** "Dashboard" riêng — gộp số liệu tổng quan vào đầu trang Lead.
- **Bỏ** "Chăm sóc" và "Lịch hẹn" — ngoài phạm vi Marketing.
- TVBH thực tế chỉ sống ở trang **Lead**.
- "Cài đặt" giữ nguyên trong dropdown avatar (không thuộc sidebar).
- Redirect mặc định `/` và sau đăng nhập → `/leads` (thay `/dashboard`).

## Quyết định 2 — Trạng thái lead = phân loại + cờ đã/chưa liên hệ

Giữ nguyên **5 trạng thái** trong DB (CHECK constraint) làm bộ **phân loại**, không đổi schema. Nghĩa nội bộ chuẩn (user xác nhận):

| Mã | Nghĩa nội bộ |
|---|---|
| KHQT | Khách quan tâm |
| GDTD | Giao dịch theo dõi |
| KHĐ | Ký hợp đồng |
| Chưa LH được | Chưa liên hệ được |
| Fail | Loại |

**Cờ đã/chưa liên hệ**: suy từ cột `last_contact_at` đã có sẵn (`NULL` = chưa liên hệ, có giá trị = đã liên hệ). KHÔNG thêm cột mới.

Trang Lead có bộ lọc nhanh: *Tất cả / Chưa liên hệ / Đã liên hệ*; mỗi lead có thao tác đánh dấu đã liên hệ + chọn phân loại (set `last_contact_at` + `status`).

## Phạm vi thay đổi code

1. `src/lib/nav.ts` — viết lại `NAV_ITEMS` còn 3 mục; cập nhật `ROLE_CAN`/`ROLE_CANNOT` bỏ ngôn ngữ "chăm sóc dài hạn" nếu lệch.
2. Redirect `/` + post-login → `/leads`.
3. Trang `/leads` — thêm dải thống kê đầu trang (thay Dashboard) + bộ lọc đã/chưa liên hệ + thao tác đánh dấu liên hệ & phân loại.
4. `PipelineReference.tsx` — sửa nhãn KHĐ/GDTD theo nghĩa nội bộ đúng.
5. Gỡ trang/route không còn trong sidebar nếu là placeholder rỗng (`/dashboard`, `/care`) — xác nhận khi thực thi.

## Ngoài phạm vi (YAGNI)

- Lịch hẹn / nhắc hẹn.
- Quản lý giao dịch, báo giá, hợp đồng (nằm ở CRM nội bộ).
- Đổi DB schema cho trạng thái/cờ liên hệ.
