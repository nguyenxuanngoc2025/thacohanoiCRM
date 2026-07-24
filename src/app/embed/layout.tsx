export const dynamic = 'force-dynamic';

/**
 * Layout nhúng iframe: KHÔNG Sidebar/StatusBar/PWA, chỉ nội dung.
 * Parent (Budget) cho iframe chiều cao cố định + cuộn nội bộ → không cần báo chiều cao ra ngoài.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
