export const dynamic = 'force-dynamic';

/**
 * Layout nhúng iframe: KHÔNG Sidebar/StatusBar/PWA, chỉ nội dung.
 * Parent (Budget) ghim iframe cao BẰNG khung; layout này TỰ là container cuộn nội bộ
 * (h-screen = đúng chiều cao iframe + overflow-y-auto) → LẤP TOÀN BỘ iframe nên lăn chuột ở
 * MỌI vị trí đều rơi vào div này → cuộn chạy. KHÔNG dựa vào cuộn <body> (iframe cross-origin
 * nuốt wheel; phải có phần tử cuộn phủ kín iframe giống dashboard app CRM thật).
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-screen overflow-y-auto bg-slate-50">{children}</div>;
}
