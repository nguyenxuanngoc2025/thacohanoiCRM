// Khung chờ (Suspense) khi server render trang /leads: KPI cards + bảng lead.
// Hiện ngay khi điều hướng, thay cho màn trắng, giữ đúng bố cục để tránh giật layout.
export default function Loading() {
  return (
    <div className="h-full flex flex-col p-3 sm:p-6 pb-1 sm:pb-2 animate-pulse">
      {/* Hàng KPI cards */}
      <div className="shrink-0 grid grid-cols-3 md:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="h-2.5 w-16 rounded bg-slate-200" />
            <div className="mt-2 h-5 w-10 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Bảng lead */}
      <div className="flex-1 min-h-0 mt-4">
        <div className="h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Thanh tab + tìm kiếm */}
          <div className="flex items-center gap-2 px-3 sm:px-6 py-3 border-b border-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 w-20 rounded-full bg-slate-200" />
            ))}
            <div className="ml-auto h-8 w-48 rounded-lg bg-slate-200" />
          </div>
          {/* Dòng dữ liệu */}
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 sm:px-6 py-3">
                <div className="h-4 w-32 rounded bg-slate-200" />
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="h-4 w-24 rounded bg-slate-200 hidden lg:block" />
                <div className="h-4 w-20 rounded bg-slate-200 hidden lg:block" />
                <div className="ml-auto h-6 w-24 rounded-full bg-slate-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
