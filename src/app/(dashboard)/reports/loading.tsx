// Khung chờ (Suspense) khi server render trang /reports: bộ lọc + tab + KPI + biểu đồ.
// Hiện ngay khi điều hướng, thay cho màn trắng, giữ đúng bố cục để tránh giật layout.
export default function Loading() {
  return (
    <div className="h-full flex flex-col p-3 sm:p-6 gap-4 animate-pulse">
      {/* Thanh lọc thời gian + tab */}
      <div className="flex items-center flex-wrap gap-2 shrink-0">
        <div className="h-9 w-36 rounded-lg bg-slate-200" />
        <div className="w-px h-6 bg-slate-200 mx-1" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-lg bg-slate-200" />
        ))}
      </div>

      {/* Hàng KPI */}
      <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-6 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Vùng biểu đồ / bảng */}
      <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white p-4">
        <div className="h-4 w-40 rounded bg-slate-200" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-40 rounded bg-slate-200" />
              <div className="h-4 rounded bg-slate-200" style={{ width: `${70 - i * 8}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
