'use client';

import React from 'react';
import { X, ExternalLink } from 'lucide-react';

/**
 * Trang hướng dẫn kết nối Facebook fanpage — viết cho người KHÔNG rành kỹ thuật.
 * Hiện dạng pop-up khi bấm "Xem hướng dẫn" ở ô kết nối Facebook.
 *
 * Cơ chế: CRM dùng một "tài khoản hệ thống" tập trung của nền tảng để nhận lead.
 * Khách chỉ cần (1) lấy Page ID, (2) cấp quyền fanpage cho doanh nghiệp của nền tảng,
 * (3) nhập Page ID vào CRM → hệ thống tự đăng ký nhận lead.
 */
export default function FacebookGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header dính trên */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#1877F214' }}>
              <span className="text-[#1877F2] font-extrabold text-base">f</span>
            </span>
            <div>
              <h3 className="font-bold text-slate-900 leading-tight">Hướng dẫn kết nối Facebook fanpage</h3>
              <p className="text-xs text-slate-400">Làm theo từng bước — khoảng 10 phút.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-6 text-sm text-slate-700">
          {/* Tóm tắt cơ chế */}
          <Section title="Tính năng này làm gì?">
            <p>
              Khi fanpage của bạn nhận lead từ <b>quảng cáo Lead Ads</b>, có <b>khách nhắn tin</b> kèm
              số điện thoại, hoặc có <b>bình luận</b> để lại số, hệ thống tự động tạo lead và giao cho
              tư vấn bán hàng. Bạn không phải copy thủ công nữa.
            </p>
          </Section>

          {/* Chuẩn bị */}
          <Section title="Cần chuẩn bị">
            <ul className="list-disc pl-5 space-y-1">
              <li>Một <b>fanpage Facebook</b> của doanh nghiệp.</li>
              <li>Tài khoản Facebook của bạn là <b>quản trị viên</b> của fanpage đó.</li>
              <li>
                <b>Mã doanh nghiệp (Business ID) của nền tảng</b> để cấp quyền — bộ phận hỗ trợ sẽ
                gửi cho bạn dãy số này.
              </li>
            </ul>
          </Section>

          {/* Phần 1: lấy Page ID */}
          <Section title="Phần 1 — Lấy mã trang (Page ID) của fanpage">
            <Steps>
              <Step n={1}>
                Mở trình duyệt, truy cập <Link href="https://business.facebook.com">business.facebook.com</Link> và
                đăng nhập bằng tài khoản quản trị fanpage.
              </Step>
              <Step n={2}>
                Bấm <b>biểu tượng bánh răng</b> (Cài đặt) ở góc dưới bên trái → vào mục
                <b> “Cài đặt doanh nghiệp”</b> (Business Settings).
              </Step>
              <Step n={3}>
                Ở cột trái, mở <b>“Tài khoản”</b> → <b>“Trang”</b>. Bấm chọn đúng fanpage của bạn.
              </Step>
              <Step n={4}>
                Bên phải hiện thông tin trang — tìm dòng <b>“ID Trang”</b> (một dãy số dài). Bấm
                <b> copy</b> dãy số này, lát nữa dán vào CRM.
              </Step>
            </Steps>
            <p className="text-xs text-slate-400">
              Mẹo nhanh khác: vào fanpage → tab <b>“Giới thiệu”</b> (About) → kéo xuống mục
              <b> “Minh bạch về Trang”</b>, ID Trang cũng hiển thị ở đây.
            </p>
          </Section>

          {/* Phần 2: cấp quyền cho nền tảng */}
          <Section title="Phần 2 — Cấp quyền fanpage cho nền tảng">
            <p className="text-xs text-slate-500 -mt-1">
              Bước này để hệ thống của nền tảng được phép nhận lead thay bạn. Chỉ làm <b>một lần</b>.
            </p>
            <Steps>
              <Step n={5}>
                Vẫn trong <b>Cài đặt doanh nghiệp</b> → <b>Tài khoản</b> → <b>Trang</b>, chọn fanpage
                của bạn (như Phần 1).
              </Step>
              <Step n={6}>
                Bấm nút <b>“Gán đối tác”</b> (Assign Partner) → chọn cách thêm bằng
                <b> “Mã doanh nghiệp”</b> (Business ID).
              </Step>
              <Step n={7}>
                Dán <b>Mã doanh nghiệp của nền tảng</b> (bộ phận hỗ trợ đã gửi cho bạn) vào ô,
                ở phần quyền hãy bật <b>“Quản lý Trang”</b> (hoặc “Toàn quyền”), rồi bấm <b>Gán</b> /
                <b> Lưu</b>.
              </Step>
            </Steps>
            <div className="rounded-xl bg-sky-50 border border-sky-100 px-4 py-3 text-[13px] text-sky-800">
              Chưa có Mã doanh nghiệp của nền tảng? Hãy liên hệ bộ phận hỗ trợ để nhận trước khi làm
              bước này. Không có mã thì hệ thống chưa nhận được lead.
            </div>
          </Section>

          {/* Phần 3: nhập vào CRM */}
          <Section title="Phần 3 — Nhập thông tin vào hệ thống CRM">
            <Steps>
              <Step n={8}>
                Đóng cửa sổ hướng dẫn này. Tại ô <b>Facebook</b>, bấm nút <b>“Thêm fanpage”</b>.
              </Step>
              <Step n={9}>
                Điền vào biểu mẫu:
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li><b>Page ID</b>: dán dãy số lấy ở Bước 4.</li>
                  <li><b>Tên hiển thị</b>: tên cho dễ nhận (ví dụ: <i>KIA Hà Nội Official</i>).</li>
                  <li><b>Thương hiệu</b> và <b>Showroom nhận lead</b>: chọn cho đúng.</li>
                </ul>
                Bấm <b>Lưu</b>. Hệ thống sẽ <b>tự đăng ký nhận lead</b> cho fanpage này.
              </Step>
              <Step n={10}>
                Nếu sau khi lưu thấy báo <b>“Đã tự đăng ký webhook”</b> là thành công. Nếu báo lỗi
                (thường do fanpage chưa được cấp quyền ở Phần 2), hãy kiểm tra lại Bước 5–7 hoặc liên
                hệ hỗ trợ.
              </Step>
            </Steps>
          </Section>

          {/* Phần 4: kiểm tra */}
          <Section title="Phần 4 — Kiểm tra hoạt động">
            <Steps>
              <Step n={11}>
                Dùng một tài khoản Facebook khác nhắn thử vào fanpage, nội dung có kèm một số điện
                thoại (ví dụ: <i>“Mình cần tư vấn, sđt 0901234567”</i>).
              </Step>
              <Step n={12}>
                Mở mục <b>Lead</b> trong CRM — lead mới sẽ xuất hiện sau vài giây. Nếu có là đã thành công.
              </Step>
            </Steps>
          </Section>

          {/* Lưu ý */}
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[13px] text-amber-800">
            <b>Lưu ý:</b> với quảng cáo <b>Lead Ads</b>, lead chỉ về khi chiến dịch đang chạy và biểu
            mẫu có trường số điện thoại. Hệ thống chỉ tạo lead khi tin nhắn / biểu mẫu có số điện thoại.
          </div>
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: '#1877F2' }}
          >
            Đã hiểu, bắt đầu kết nối
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="font-bold text-slate-900 text-[15px]">{title}</h4>
      {children}
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-3">{children}</ol>;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#1877F2] text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="flex-1 leading-relaxed">{children}</div>
    </li>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-[#1877F2] font-semibold hover:underline"
    >
      {children}<ExternalLink size={12} />
    </a>
  );
}
