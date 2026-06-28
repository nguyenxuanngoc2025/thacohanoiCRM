'use client';

import React, { useState } from 'react';
import { X, ExternalLink, Copy, Check } from 'lucide-react';

/**
 * Trang hướng dẫn kết nối Facebook fanpage — viết cho người KHÔNG rành kỹ thuật.
 * Hiện dạng pop-up khi bấm "Xem hướng dẫn" ở ô kết nối Facebook.
 *
 * Cơ chế (Cách A — khách KHÔNG cần tạo Business Manager): nền tảng chủ động gửi
 * "Yêu cầu quyền truy cập Trang" tới fanpage của khách; khách chỉ cần bấm DUYỆT.
 * Sau đó nền tảng gán tài khoản hệ thống vào fanpage để nhận lead.
 * Khách chỉ phải: (1) lấy Page ID, (2) duyệt yêu cầu, (3) nhập Page ID vào CRM.
 *
 * businessId = Business ID của BM nền tảng (chủ nền tảng đặt ở Admin → Cấu hình).
 * Dùng trong khối "Dành cho người quản trị nền tảng" ở Phần 2 (kèm nút copy).
 */
export default function FacebookGuideModal({ onClose, businessId }: { onClose: () => void; businessId?: string }) {
  const bizId = (businessId ?? '').trim();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bizId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bị chặn — bỏ qua, user copy tay */
    }
  };

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
                <b>Bạn KHÔNG cần tạo Business Manager.</b> Nền tảng sẽ gửi một yêu cầu xin quyền
                truy cập fanpage — bạn chỉ cần bấm <b>Duyệt</b>.
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

          {/* Phần 2: cấp quyền cho nền tảng — Cách A (khách chỉ DUYỆT) */}
          <Section title="Phần 2 — Cấp quyền fanpage cho nền tảng">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-[13px] text-emerald-800 -mt-1">
              <b>Cách dễ nhất:</b> bạn <b>không phải tạo gì cả</b>. Nền tảng sẽ gửi một <b>yêu cầu
              xin quyền truy cập</b> tới fanpage của bạn — việc của bạn chỉ là vào fanpage và bấm
              <b> Duyệt</b>. Chỉ làm <b>một lần</b>.
            </div>
            <Steps>
              <Step n={5}>
                <b>Gửi cho bộ phận hỗ trợ của nền tảng</b> hai thông tin: <b>tên fanpage</b> và
                <b> ID Trang</b> (dãy số bạn vừa copy ở Bước 4). Nền tảng sẽ dùng thông tin này để
                gửi yêu cầu xin quyền tới đúng fanpage của bạn.
              </Step>
              <Step n={6}>
                Sau khi nền tảng gửi, bạn sẽ nhận được thông báo. Mở fanpage của bạn →
                <b> Cài đặt</b> (Settings) → tìm mục <b>“Quyền truy cập vào Trang”</b> (Page access)
                hoặc <b>“Đối tác kinh doanh”</b> (Business partners). Tại đây sẽ thấy một
                <b> yêu cầu đang chờ</b> từ doanh nghiệp của nền tảng.
              </Step>
              <Step n={7}>
                Bấm <b>Duyệt</b> / <b>Chấp nhận</b> yêu cầu đó. Xong — bạn <b>không cần làm gì thêm</b>.
                Báo lại cho nền tảng là đã duyệt để bên kỹ thuật hoàn tất kết nối.
              </Step>
            </Steps>

            {/* Khối kỹ thuật dành cho người quản trị nền tảng */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Dành cho người quản trị nền tảng
              </div>
              <p className="text-[13px] text-slate-600">
                Vào <Link href="https://business.facebook.com/settings">business.facebook.com/settings</Link> →
                <b> Tài khoản</b> → <b>Trang</b> → <b>Thêm</b> → <b>“Yêu cầu quyền truy cập vào Trang”</b>
                (Request access to a Page). Nhập <b>tên hoặc ID Trang</b> của khách rồi gửi yêu cầu.
                Sau khi khách <b>Duyệt</b>: vào <b>Người dùng</b> → <b>Người dùng hệ thống</b> → chọn
                tài khoản hệ thống → <b>Gán tài sản</b> → chọn fanpage → bật <b>“Quản lý Trang”</b>.
                (Bước gán này bắt buộc, nếu thiếu hệ thống sẽ báo “không lấy được page token”.)
              </p>
              {bizId && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Mã doanh nghiệp của nền tảng (Business ID):</div>
                  <div className="flex items-stretch gap-2">
                    <code className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-800 break-all font-mono">
                      {bizId}
                    </code>
                    <button
                      onClick={copy}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white"
                      style={{ background: copied ? '#16a34a' : '#1877F2' }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Đã copy' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
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
                (thường do bạn <b>chưa Duyệt</b> yêu cầu ở Phần 2, hoặc nền tảng chưa gán xong tài
                khoản hệ thống), hãy kiểm tra lại Bước 5–7 hoặc liên hệ hỗ trợ.
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
