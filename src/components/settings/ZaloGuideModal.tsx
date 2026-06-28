'use client';

import React, { useEffect, useState } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';

/**
 * Trang hướng dẫn kết nối Zalo OA — viết cho người KHÔNG rành kỹ thuật.
 * Hiện dạng pop-up khi bấm "Xem hướng dẫn" ở ô kết nối Zalo.
 */
export default function ZaloGuideModal({ onClose }: { onClose: () => void }) {
  // URL webhook tự lấy theo tên miền hiện tại → mỗi công ty thấy đúng URL của mình.
  const [webhookUrl, setWebhookUrl] = useState('https://.../api/webhook/zalo');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhook/zalo`);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
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
            <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#0068FF14' }}>
              <span className="text-[#0068FF] font-extrabold text-sm">Zalo</span>
            </span>
            <div>
              <h3 className="font-bold text-slate-900 leading-tight">Hướng dẫn kết nối Zalo OA</h3>
              <p className="text-xs text-slate-400">Làm theo từng bước — khoảng 10 phút.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-6 text-sm text-slate-700">
          {/* Tóm tắt cơ chế */}
          <Section title="Tính năng này làm gì?">
            <p>
              Khi khách nhắn tin vào trang Zalo OA của bạn <b>có kèm số điện thoại</b>, hệ thống tự
              động tạo lead và giao cho tư vấn bán hàng. Bạn không phải copy thủ công nữa. Khách chỉ
              chat mà không để số thì sẽ không tạo lead.
            </p>
          </Section>

          {/* Chuẩn bị */}
          <Section title="Cần chuẩn bị">
            <ul className="list-disc pl-5 space-y-1">
              <li>Một <b>Zalo Official Account (OA)</b> đã được Zalo duyệt cho doanh nghiệp.</li>
              <li>Tài khoản Zalo cá nhân đang là <b>quản trị viên</b> của OA đó.</li>
            </ul>
            <p className="text-xs text-slate-400">
              Chưa có OA? Tạo miễn phí tại <Link href="https://oa.zalo.me">oa.zalo.me</Link> rồi gửi
              hồ sơ xác thực doanh nghiệp trước khi làm tiếp.
            </p>
          </Section>

          {/* Phần B: lấy thông tin từ Zalo */}
          <Section title="Phần 1 — Tạo ứng dụng & lấy thông tin trên Zalo">
            <Steps>
              <Step n={1}>
                Mở trình duyệt, truy cập <Link href="https://developers.zalo.me">developers.zalo.me</Link>.
                Bấm <b>Đăng nhập</b> (góc trên bên phải) bằng tài khoản Zalo quản lý OA.
              </Step>
              <Step n={2}>
                Bấm vào <b>ảnh đại diện</b> ở góc trên cùng bên phải màn hình → một menu sổ xuống,
                chọn <b>“Thêm ứng dụng mới”</b>. Đặt tên tuỳ ý (ví dụ: <i>CRM Lead</i>), chọn loại
                liên quan tới doanh nghiệp, rồi bấm <b>Tạo</b>.
              </Step>
              <Step n={3}>
                Trong ứng dụng vừa tạo, ở menu bên trái chọn <b>“Official Account”</b> →
                bấm <b>“Liên kết OA”</b> → chọn đúng OA của bạn → xác nhận.
              </Step>
              <Step n={4}>
                Vẫn ở mục <b>Official Account</b>, tìm dòng <b>“OA Secret Key”</b> (khoá bí mật).
                Bấm <b>Hiện</b> rồi <b>copy</b> chuỗi ký tự này — lát nữa dán vào CRM. Giữ kín, không
                gửi cho ai.
              </Step>
              <Step n={5}>
                Lấy <b>OA ID</b>: mở tab mới vào <Link href="https://oa.zalo.me">oa.zalo.me</Link> →
                chọn OA → <b>Quản lý OA</b> → <b>Thông tin</b>. <b>OA ID</b> là một dãy số dài — copy lại.
              </Step>
              <Step n={6}>
                Quay lại developers.zalo.me, trong ứng dụng chọn menu <b>“Webhook”</b> ở bên trái.
                <div className="mt-2 mb-2">
                  <div className="text-xs font-semibold text-slate-500 mb-1">Dán địa chỉ Webhook URL này:</div>
                  <div className="flex items-stretch gap-2">
                    <code className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 break-all font-mono">
                      {webhookUrl}
                    </code>
                    <button
                      onClick={copy}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white"
                      style={{ background: copied ? '#16a34a' : '#0068FF' }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Đã copy' : 'Copy'}
                    </button>
                  </div>
                </div>
                Bên dưới, ở danh sách sự kiện hãy <b>tích chọn “User gửi tin nhắn văn bản”</b>
                (tên kỹ thuật: <i>user_send_text</i>). Cuối cùng bấm <b>Lưu</b>.
              </Step>
            </Steps>
          </Section>

          {/* Phần C: nhập vào CRM */}
          <Section title="Phần 2 — Nhập thông tin vào hệ thống CRM">
            <Steps>
              <Step n={7}>
                Đóng cửa sổ hướng dẫn này. Tại ô <b>Zalo OA</b>, bấm nút <b>“Thêm OA”</b>.
              </Step>
              <Step n={8}>
                Điền vào biểu mẫu:
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li><b>OA ID</b>: dán dãy số lấy ở Bước 5.</li>
                  <li><b>Tên hiển thị</b>: tên cho dễ nhận (ví dụ: <i>KIA Hà Nội OA</i>).</li>
                  <li><b>OA Secret Key</b>: dán khoá lấy ở Bước 4.</li>
                  <li><b>Thương hiệu</b> và <b>Showroom nhận lead</b>: chọn cho đúng.</li>
                </ul>
                Bấm <b>Lưu</b>.
              </Step>
            </Steps>
          </Section>

          {/* Phần D: kiểm tra */}
          <Section title="Phần 3 — Kiểm tra hoạt động">
            <Steps>
              <Step n={9}>
                Dùng một điện thoại khác nhắn thử vào trang Zalo OA, nội dung có kèm một số điện
                thoại (ví dụ: <i>“Mình cần tư vấn, sđt 0901234567”</i>).
              </Step>
              <Step n={10}>
                Mở mục <b>Lead</b> trong CRM — lead mới sẽ xuất hiện sau vài giây. Nếu có là đã thành công.
              </Step>
            </Steps>
          </Section>

          {/* Lưu ý quảng cáo */}
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[13px] text-amber-800">
            <b>Về lead từ quảng cáo Zalo:</b> phần này cần cấu hình thêm ở tài khoản quảng cáo và do
            đội kỹ thuật của nền tảng hỗ trợ thiết lập một lần. Hãy liên hệ để được hỗ trợ — bạn
            không cần tự làm.
          </div>
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: '#0068FF' }}
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
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#0068FF] text-white text-xs font-bold flex items-center justify-center mt-0.5">
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
      className="inline-flex items-center gap-0.5 text-[#0068FF] font-semibold hover:underline"
    >
      {children}<ExternalLink size={12} />
    </a>
  );
}
