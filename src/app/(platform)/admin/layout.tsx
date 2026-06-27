import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentRole } from '@/lib/platform-guard';

export const dynamic = 'force-dynamic';

const TABS = [
  { href: '/admin/companies', label: 'Công ty' },
  { href: '/admin/catalog', label: 'Thương hiệu & dòng xe' },
];

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside
        className="w-60 shrink-0 flex flex-col text-white"
        style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid rgba(0,0,0,0.18)' }}
      >
        <div
          className="px-5 py-4 flex flex-col items-center text-center gap-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://thacoautohanoi.vn/storage/logo/header-website.webp" alt="Thaco Auto" style={{ height: 24, objectFit: 'contain' }} />
          <p className="text-[13px] font-semibold uppercase tracking-wide text-white">Bảng điều khiển nền tảng</p>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>Quản trị toàn bộ công ty</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white/80 hover:bg-white/10 hover:text-white"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
