'use client';
import React, { useMemo } from 'react';
import { CHANNEL_LABEL, pct, rollupTotals, type KpiRow, type ChannelCode } from '@/lib/kpi-targets';

const nf = new Intl.NumberFormat('vi-VN');
const money = (n: number) => nf.format(Math.round(n));

export default function KpiTargetsTab({ rows, year, month }: { rows: KpiRow[]; year: number; month: number }) {
  const totals = useMemo(() => rollupTotals(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
        Chưa có dữ liệu mục tiêu cho tháng {month}/{year}. Kiểm tra ánh xạ dòng xe hoặc chọn tháng khác.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-500">Kỳ: tháng {month}/{year} · nguồn mục tiêu: App Budget</div>
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b">
              <th className="px-3 py-2">Showroom</th>
              <th className="px-3 py-2">Dòng xe</th>
              <th className="px-3 py-2">Kênh</th>
              <th className="px-3 py-2 text-right">KHQT (TH/KH)</th>
              <th className="px-3 py-2 text-right">% đạt</th>
              <th className="px-3 py-2 text-right">GDTD (TH/KH)</th>
              <th className="px-3 py-2 text-right">KHĐ (TH/KH)</th>
              <th className="px-3 py-2 text-right">% KHĐ</th>
              <th className="px-3 py-2 text-right">Ngân sách KH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2">{r.showroom_name}</td>
                <td className="px-3 py-2">{r.model_name} <span className="text-slate-400">· {r.brand_name}</span></td>
                <td className="px-3 py-2">{CHANNEL_LABEL[r.channel as ChannelCode] ?? r.channel}</td>
                <td className="px-3 py-2 text-right">{r.actual_khqt}/{r.plan_khqt}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: pct(r.actual_khqt, r.plan_khqt) >= 100 ? '#047857' : '#b45309' }}>{pct(r.actual_khqt, r.plan_khqt)}%</td>
                <td className="px-3 py-2 text-right">{r.actual_gdtd}/{r.plan_gdtd}</td>
                <td className="px-3 py-2 text-right">{r.actual_khd}/{r.plan_khd}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: pct(r.actual_khd, r.plan_khd) >= 100 ? '#047857' : '#b45309' }}>{pct(r.actual_khd, r.plan_khd)}%</td>
                <td className="px-3 py-2 text-right text-slate-500">{money(r.plan_ns)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold bg-slate-50">
              <td className="px-3 py-2" colSpan={3}>Tổng</td>
              <td className="px-3 py-2 text-right">{totals.actual_khqt}/{totals.plan_khqt}</td>
              <td className="px-3 py-2 text-right">{pct(totals.actual_khqt, totals.plan_khqt)}%</td>
              <td className="px-3 py-2 text-right">{totals.actual_gdtd}/{totals.plan_gdtd}</td>
              <td className="px-3 py-2 text-right">{totals.actual_khd}/{totals.plan_khd}</td>
              <td className="px-3 py-2 text-right">{pct(totals.actual_khd, totals.plan_khd)}%</td>
              <td className="px-3 py-2 text-right text-slate-500">{money(totals.plan_ns)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
