// app/src/app/(dashboard)/doi-soat/B10ImportView.tsx
'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileCheck2, Loader2 } from 'lucide-react';

interface Mapping { phone_col: string; status_col: string; note_col?: string }
interface Summary { totalRows: number; matched: number; notFound: number; outOfScope: number; unrecognized: string[]; statusRaised: number; conflicts: number }

export default function B10ImportView({ savedMapping }: { savedMapping: Mapping | null }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [phoneCol, setPhoneCol] = useState('');
  const [statusCol, setStatusCol] = useState('');
  const [noteCol, setNoteCol] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null); setSummary(null); setFileName(f.name);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Đọc dạng mảng-các-hàng để tự dò dòng tiêu đề thật (file B10 có nhiều dòng
    // tiêu đề/logo phía trên; tiêu đề cột nằm ở giữa file, không phải dòng 1).
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const { headers: hdrs, rows: parsed } = extractTable(aoa);
    if (parsed.length === 0) { setErr('File không có dòng dữ liệu.'); return; }
    setHeaders(hdrs);
    setRawRows(parsed);
    // Tự chọn lại theo ánh xạ đã lưu nếu header khớp; nếu không thì đoán theo tên cột.
    const p = savedMapping && hdrs.includes(savedMapping.phone_col) ? savedMapping.phone_col : guess(hdrs, ['số điện thoại', 'sđt', 'sdt', 'điện thoại', 'phone']);
    // Ưu tiên "trạng thái cuối" (cột W) hơn "trạng thái đầu"/"trạng thái hợp đồng".
    const s = savedMapping && hdrs.includes(savedMapping.status_col) ? savedMapping.status_col : guess(hdrs, ['trạng thái cuối', 'kết quả', 'trạng thái', 'status']);
    const nt = savedMapping?.note_col && hdrs.includes(savedMapping.note_col) ? savedMapping.note_col : guess(hdrs, ['nội dung đàm phán', 'nội dung', 'chăm sóc', 'ghi chú', 'note']);
    setPhoneCol(p); setStatusCol(s); setNoteCol(nt);
  };

  const submit = async () => {
    if (!phoneCol || !statusCol) { setErr('Hãy chọn cột SĐT và cột kết quả.'); return; }
    setBusy(true); setErr(null);
    const rows = rawRows.map((r) => ({
      phone: String(r[phoneCol] ?? ''),
      status: String(r[statusCol] ?? ''),
      note: noteCol ? String(r[noteCol] ?? '') : '',
    }));
    const res = await fetch('/api/b10/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, mapping: { phone_col: phoneCol, status_col: statusCol, note_col: noteCol } }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? 'Lỗi khi đối soát.'); return; }
    setSummary(data.summary as Summary);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-slate-800">Đối soát kết quả B10</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tải file Excel xuất từ B10 (có cột SĐT và cột kết quả chăm sóc). App khớp theo SĐT,
          chỉ cập nhật lead trong phạm vi của bạn — không tạo lead mới.
        </p>
      </header>

      <label className="flex items-center gap-3 border-2 border-dashed border-slate-300 rounded-xl px-4 py-6 cursor-pointer hover:border-slate-400">
        <Upload size={20} className="text-slate-400" />
        <span className="text-sm text-slate-600">{fileName || 'Chọn file Excel (.xlsx, .xls)'}</span>
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
      </label>

      {headers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white rounded-xl border border-slate-200 p-4">
          <ColSelect label="Cột SĐT" value={phoneCol} onChange={setPhoneCol} options={headers} />
          <ColSelect label="Cột kết quả B10" value={statusCol} onChange={setStatusCol} options={headers} />
          <ColSelect label="Cột nội dung chăm sóc (tuỳ chọn)" value={noteCol} onChange={setNoteCol} options={headers} />
          <div className="sm:col-span-2">
            <button onClick={submit} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              style={{ background: '#004B9B' }}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
              {busy ? 'Đang đối soát…' : 'Đối soát'}
            </button>
          </div>
        </div>
      )}

      {err && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{err}</div>}

      {summary && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
          <h2 className="font-semibold text-slate-800">Kết quả đối soát</h2>
          <Stat label="Tổng dòng đọc được" value={summary.totalRows} />
          <Stat label="Khớp & cập nhật" value={summary.matched} tone="#047857" />
          <Stat label="Tự nâng phân loại (TVBH chưa cập nhật)" value={summary.statusRaised} tone="#004B9B" />
          <Stat label="Lệch B10 cao hơn (đã báo, chưa tự sửa)" value={summary.conflicts} tone={summary.conflicts > 0 ? '#b45309' : undefined} />
          <Stat label="Không tìm thấy lead" value={summary.notFound} />
          <Stat label="Ngoài phạm vi" value={summary.outOfScope} />
          {summary.unrecognized.length > 0 && (
            <div className="pt-2 text-slate-600">
              <div className="font-medium">Giá trị kết quả lạ (đã đánh dấu đã lên B10, chưa phân loại):</div>
              <div className="text-slate-500">{summary.unrecognized.join(', ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Dò bảng dữ liệu thật trong file B10 (nhiều dòng tiêu đề/logo phía trên).
 * - Tìm dòng tiêu đề: dòng đầu tiên (trong ~30 dòng đầu) có ô chứa "điện thoại"/"sđt".
 * - Ghép tên cột từ dòng tiêu đề đó + dòng ngay trên (tiêu đề nhóm) để tên đầy đủ,
 *   vd cột W = "Trạng thái cuối", cột R = "NỘI DUNG ĐÀM PHÁN VỚI KHÁCH HÀNG".
 * - Ô tiêu đề trống → đặt tên "Cột A/B/…" để vẫn chọn được.
 * - Không tìm thấy dòng tiêu đề → coi dòng 1 là tiêu đề (giữ hành vi cũ).
 */
function extractTable(aoa: unknown[][]): { headers: string[]; rows: Record<string, unknown>[] } {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  let hIdx = -1;
  const scan = Math.min(aoa.length, 30);
  for (let i = 0; i < scan; i++) {
    const cells = (aoa[i] ?? []).map(norm);
    if (cells.some((c) => c.includes('điện thoại') || c === 'sđt' || c === 'sdt')) { hIdx = i; break; }
  }
  if (hIdx < 0) hIdx = 0;

  const headerRow = aoa[hIdx] ?? [];
  const aboveRow = hIdx > 0 ? (aoa[hIdx - 1] ?? []) : [];
  const ncols = Math.max(headerRow.length, aboveRow.length);

  const headers: string[] = [];
  const seen: Record<string, number> = {};
  for (let c = 0; c < ncols; c++) {
    let name = String(headerRow[c] ?? '').trim() || String(aboveRow[c] ?? '').trim();
    name = name.replace(/\s+/g, ' ');
    if (!name) name = `Cột ${XLSX.utils.encode_col(c)}`;
    if (seen[name] != null) { seen[name] += 1; name = `${name} (${seen[name]})`; }
    else seen[name] = 0;
    headers.push(name);
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = hIdx + 1; i < aoa.length; i++) {
    const arr = aoa[i] ?? [];
    // Bỏ dòng trống hoàn toàn (và dòng tổng hợp không có SĐT sẽ bị đối soát đếm là "không tìm thấy").
    if (arr.every((v) => String(v ?? '').trim() === '')) continue;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < ncols; c++) obj[headers[c]] = arr[c] ?? '';
    rows.push(obj);
  }
  return { headers, rows };
}

function guess(headers: string[], hints: string[]): string {
  const low = headers.map((h) => h.toLowerCase());
  for (const hint of hints) {
    const i = low.findIndex((h) => h.includes(hint));
    if (i >= 0) return headers[i];
  }
  return '';
}

function ColSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
        <option value="">— Chọn cột —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <b style={{ color: tone ?? '#0f172a' }}>{value}</b>
    </div>
  );
}
