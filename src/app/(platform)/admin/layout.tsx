import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentRole } from '@/lib/platform-guard';

export const dynamic = 'force-dynamic';

const TABS = [
  { href: '/admin/companies', label: 'Công ty' },
];

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">Bảng điều khiển nền tảng</p>
          <p className="text-xs text-slate-400 mt-0.5">Quản trị toàn bộ công ty</p>
        </div>
        <nav className="p-2 space-y-0.5">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
              {t.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
