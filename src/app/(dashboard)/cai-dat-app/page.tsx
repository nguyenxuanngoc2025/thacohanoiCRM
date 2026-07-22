'use client';

import React, { useEffect, useState } from 'react';
import { Monitor, Smartphone, Share, Download, CheckCircle2, MoreVertical, Plus, Info } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import PushToggle from '@/components/settings/PushToggle';

// Sự kiện cài PWA của Chrome/Edge (chỉ desktop + Android hỗ trợ).
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function CaiDatAppPage() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const doInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-10">
      {/* Tiêu đề */}
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Cài đặt ứng dụng</h1>
        <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
          Cài <span className="font-semibold text-slate-700">CRM System</span> vào máy tính hoặc điện thoại để mở nhanh
          từ màn hình chính và sử dụng toàn màn hình như một ứng dụng độc lập — không còn thanh địa chỉ trình duyệt.
        </p>
      </div>

      {installed && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>Bạn đang mở ở chế độ ứng dụng đã cài đặt. Không cần cài lại.</span>
        </div>
      )}

      <div className="mb-4">
        <PushToggle />
      </div>

      <div className="space-y-4">
        {/* MÁY TÍNH */}
        <Card icon={<Monitor size={20} />} title="Máy tính (Windows / macOS)"
          subtitle="Dùng trình duyệt Google Chrome hoặc Microsoft Edge.">
          <div className="flex flex-col gap-3">
            <button
              onClick={doInstall}
              disabled={!deferred || installed}
              className="inline-flex w-fit items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: BRAND }}
            >
              <Download size={16} />
              {installed ? 'Đã cài đặt' : 'Cài đặt ngay'}
            </button>
            {!deferred && !installed && (
              <Note>
                Nếu nút chưa bấm được: mở trang bằng <b>Chrome</b> hoặc <b>Edge</b>, rồi nhấn biểu tượng cài đặt
                (màn hình nhỏ có mũi tên) ở góc phải thanh địa chỉ và chọn <b>Cài đặt</b>. Safari trên macOS chưa hỗ trợ
                cài đặt — vui lòng dùng Chrome hoặc Edge.
              </Note>
            )}
          </div>
        </Card>

        {/* ANDROID */}
        <Card icon={<Smartphone size={20} />} title="Điện thoại Android"
          subtitle="Dùng trình duyệt Google Chrome.">
          <Steps items={[
            <>Mở trang web CRM bằng ứng dụng <b>Chrome</b>.</>,
            <>Nhấn biểu tượng <b>ba chấm dọc</b> <MoreVertical size={14} className="inline align-text-bottom" /> ở góc trên bên phải.</>,
            <>Chọn <b>“Cài đặt ứng dụng”</b> (hoặc <b>“Thêm vào Màn hình chính”</b>).</>,
            <>Nhấn <b>“Cài đặt”</b> để xác nhận.</>,
          ]} />
          <Note>
            Nếu Chrome tự hiện dải <b>“Cài đặt ứng dụng”</b> ở phía dưới màn hình, bạn có thể nhấn trực tiếp vào đó.
          </Note>
        </Card>

        {/* iOS */}
        <Card icon={<Share size={20} />} title="iPhone / iPad"
          subtitle="Bắt buộc dùng trình duyệt Safari.">
          <Steps items={[
            <>Mở trang web CRM bằng <b>Safari</b> (không dùng Chrome trên iPhone).</>,
            <>Nhấn biểu tượng <b>Chia sẻ</b> <Share size={14} className="inline align-text-bottom" /> (ô vuông có mũi tên hướng lên) ở thanh công cụ.</>,
            <>Vuốt xuống, chọn <b>“Thêm vào MH chính”</b> <Plus size={14} className="inline align-text-bottom" />.</>,
            <>Nhấn <b>“Thêm”</b> ở góc trên bên phải.</>,
          ]} />
          <Note>Yêu cầu iOS phiên bản 16.4 trở lên để hiển thị toàn màn hình.</Note>
        </Card>
      </div>

      <p className="mt-6 text-xs text-slate-400 leading-relaxed">
        Nên đăng nhập vào hệ thống trước khi cài đặt. Sau khi cài, biểu tượng ứng dụng sẽ xuất hiện trên màn hình chính
        (điện thoại) hoặc trong danh sách ứng dụng / Start Menu (máy tính) — mở lên là dùng ngay như một ứng dụng riêng.
      </p>
    </div>
  );
}

function Card({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: BRAND }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-slate-700 leading-relaxed">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: BRAND }}>
            {i + 1}
          </span>
          <span className="flex-1">{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 leading-relaxed">
      <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
      <span className="flex-1">{children}</span>
    </div>
  );
}
