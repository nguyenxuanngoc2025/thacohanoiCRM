'use client';
import React from 'react';
import { X } from 'lucide-react';

export default function GoogleSheetGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#0F9D5814' }}>
              <span className="text-[#0F9D58] font-extrabold text-base">S</span>
            </span>
            <div>
              <h3 className="font-bold text-slate-900 leading-tight">Hướng dẫn kết nối Google Sheet</h3>
              <p className="text-xs text-slate-400">Hút lead từ sheet agency chia sẻ — vài phút.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-6 text-sm text-slate-700">
          <Section title="Tính năng này làm gì?">
            <p>Hệ thống tự đọc các dòng trong Google Sheet (agency đổ lead vào) và tạo lead, giao cho tư vấn bán hàng. Quét lại mỗi vài phút, tự bỏ trùng theo số điện thoại.</p>
          </Section>
          <Section title="Cần chuẩn bị">
            <ul className="list-disc pl-5 space-y-1">
              <li>Một <b>tài khoản Google</b> được agency <b>chia sẻ quyền xem</b> sheet.</li>
              <li>Sheet có cột <b>Số điện thoại</b> (bắt buộc), nên có cột <b>Họ tên</b>.</li>
            </ul>
          </Section>
          <Section title="Các bước">
            <Steps>
              <Step n={1}>Bấm <b>“Kết nối Google”</b> → cửa sổ Google hiện ra, đăng nhập tài khoản được chia sẻ sheet.</Step>
              <Step n={2}>Bấm <b>“Cho phép”</b> để cấp quyền đọc file bạn chọn (chỉ file bạn chọn, không phải toàn bộ Drive).</Step>
              <Step n={3}>Quay lại CRM, bấm <b>“Thêm sheet”</b> → cửa sổ chọn file Google hiện ra → chọn đúng sheet agency chia sẻ.</Step>
              <Step n={4}>Màn <b>xác nhận cột</b>: hệ thống tự đoán cột Số điện thoại / Họ tên. Kiểm lại cho đúng, chọn <b>Thương hiệu</b> + <b>Showroom nhận lead</b>, rồi <b>Lưu</b>.</Step>
              <Step n={5}>Xong. Lần quét kế tiếp sẽ nạp toàn bộ dòng đang có (lead cũ cũng vào, đã bỏ trùng).</Step>
            </Steps>
          </Section>
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[13px] text-amber-800">
            <b>Lưu ý:</b> agency phải <b>chia sẻ quyền xem sheet</b> cho đúng email Google bạn dùng để kết nối, nếu không hệ thống không đọc được.
          </div>
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: '#0F9D58' }}>
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><h4 className="font-bold text-slate-900 text-[15px]">{title}</h4>{children}</div>;
}
function Steps({ children }: { children: React.ReactNode }) { return <ol className="space-y-3">{children}</ol>; }
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#0F9D58] text-white text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <div className="flex-1 leading-relaxed">{children}</div>
    </li>
  );
}
