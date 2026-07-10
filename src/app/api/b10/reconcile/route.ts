// app/src/app/api/b10/reconcile/route.ts
import { NextResponse } from 'next/server';
import { requireB10Importer } from '@/lib/b10-import-guard';
import { reconcileB10, type B10Row } from '@/lib/b10';
import { normalizePhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';

interface Body {
  rows: B10Row[];
  mapping?: { phone_col: string; status_col: string; note_col?: string };
}

export async function POST(req: Request) {
  const gate = await requireB10Importer();
  if (gate.error) return gate.error;
  const { supabase, service, userId, companyId } = gate.ctx;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: 'File không có dòng dữ liệu' }, { status: 400 });
  }

  // Chỉ tải lead khớp SĐT trong file (chuẩn hoá +84…) để giảm tải.
  const phones = [...new Set(
    rows.map((r) => normalizePhone(r.phone)).filter((p): p is string => !!p),
  )];

  // Lead trong PHẠM VI người import (RLS-scoped) — chỉ những lead này được sửa.
  const { data: scopedRaw } = await supabase.from('leads').select('id, phone, b10_status, status, last_contact_at');
  const scopedFull = ((scopedRaw ?? []) as {
    id: string; phone: string; b10_status: B10Row['status']; status: B10Row['status']; last_contact_at: string | null;
  }[]).filter((l) => {
    const k = normalizePhone(l.phone);
    return k != null && phones.includes(k);
  });
  const scopedLeads = scopedFull.map((l) => ({
    id: l.id, phone: l.phone,
    b10_status: (l.b10_status as never) ?? null,
    status: (l.status as never) ?? null,
  }));
  // Mốc liên hệ hiện tại của từng lead — để quyết định có đánh dấu "đã liên hệ" khi nâng trạng thái.
  const contactedAt = new Map(scopedFull.map((l) => [l.id, l.last_contact_at]));

  // Toàn bộ SĐT công ty (bypass RLS) — phân biệt "ngoài phạm vi" vs "không tìm thấy".
  const { data: companyRaw } = await service.from('leads').select('phone').eq('company_id', companyId);
  const companyPhones = new Set(
    ((companyRaw ?? []) as { phone: string }[])
      .map((l) => normalizePhone(l.phone))
      .filter((p): p is string => !!p),
  );

  const { updates, summary } = reconcileB10(rows, scopedLeads, companyPhones);

  const now = new Date().toISOString();
  // Gom log để ghi 1 lần cuối (tránh nhiều round-trip trong vòng lặp).
  const logs: { lead_id: string; user_id: string; type: string; old_status: string | null; new_status: string | null; content: string }[] = [];
  for (const u of updates) {
    const patch: Record<string, unknown> = { b10_status: u.b10_status, b10_synced_at: now };
    // Chỉ ghi đè nội dung chăm sóc khi file có giá trị mới — tránh xoá ghi chú cũ.
    if (u.b10_care_note) patch.b10_care_note = u.b10_care_note;
    // Phương án A: nâng trạng thái chính khi TVBH chưa phân loại. Theo quy ước app
    // "phân loại tức là đã làm việc với lead" → đánh dấu đã liên hệ nếu trước đó chưa.
    if (u.new_status) {
      patch.status = u.new_status;
      if (!contactedAt.get(u.id)) patch.last_contact_at = now;
      logs.push({
        lead_id: u.id, user_id: userId, type: 'status_change',
        old_status: null, new_status: u.new_status,
        content: `Đối soát B10: nâng phân loại sang ${u.new_status}.`,
      });
    }
    await supabase.from('leads').update(patch).eq('id', u.id);
  }
  if (logs.length > 0) await supabase.from('lead_logs').insert(logs);

  // Lưu ánh xạ cột cho công ty để lần sau gợi ý sẵn.
  if (body.mapping?.phone_col && body.mapping?.status_col) {
    await service.from('companies').update({ b10_mapping: body.mapping }).eq('id', companyId);
  }

  return NextResponse.json({ summary });
}
