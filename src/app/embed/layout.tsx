import EmbedHeightReporter from './EmbedHeightReporter';

export const dynamic = 'force-dynamic';

/** Layout nhúng iframe: KHÔNG Sidebar/StatusBar/PWA, chỉ nội dung + báo chiều cao cho parent. */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-50">
      <EmbedHeightReporter />
      {children}
    </div>
  );
}
