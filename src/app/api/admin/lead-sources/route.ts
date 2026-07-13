import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { writeAudit } from '@/lib/platform-audit';
import { assertSourceEditable, type SourceChannelRow } from '@/lib/source-catalog';

// CRUD danh mục Nguồn & chi tiết kênh — toàn cục, chỉ Chủ nền tảng.
// Kênh hệ thống (is_builtin): chỉ đổi label/platform_name/is_active/sort_order, KHÔNG đổi value, KHÔNG xoá.
export async function POST(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete';

    // Lấy dòng hiện tại cho update/delete để kiểm builtin.
    let current: SourceChannelRow | null = null;
    if (op === 'update' || op === 'delete') {
      const { data } = await service
        .from('lead_source_channels')
        .select('platform_key, platform_name, value, label, is_builtin, is_active, digital, sort_order')
        .eq('id', body.id)
        .maybeSingle();
      current = (data as SourceChannelRow | null) ?? null;
      if (!current) return NextResponse.json({ error: 'Không tìm thấy kênh.' }, { status: 404 });
    }

    if (op === 'delete') {
      const gate = assertSourceEditable(current!, { _delete: true });
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 400 });
      const { error } = await service.from('lead_source_channels').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await writeAudit(service, userId, 'lead_source.delete', 'lead_source_channel', body.id, { value: current!.value });
      return NextResponse.json({ success: true });
    }

    const label = String(body.label ?? '').trim();
    if (!label) return NextResponse.json({ error: 'Nhập tên chi tiết kênh.' }, { status: 400 });
    const platformKey = String(body.platform_key ?? '').trim();
    const platformName = String(body.platform_name ?? '').trim();
    if (!platformKey || !platformName) return NextResponse.json({ error: 'Thiếu Nguồn.' }, { status: 400 });

    if (op === 'update') {
      const patch = {
        value: body.value !== undefined ? String(body.value).trim() : undefined,
        label,
        platform_name: platformName,
        is_active: body.is_active === undefined ? current!.is_active : !!body.is_active,
        sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : current!.sort_order,
      };
      const gate = assertSourceEditable(current!, patch);
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 400 });
      // Kênh hệ thống: KHÔNG đổi value, KHÔNG đổi platform_key.
      const row = current!.is_builtin
        ? { label, platform_name: platformName, is_active: patch.is_active, sort_order: patch.sort_order }
        : {
            platform_key: platformKey,
            platform_name: platformName,
            value: patch.value ?? current!.value,
            label,
            is_active: patch.is_active,
            digital: body.digital === undefined ? current!.digital : !!body.digital,
            sort_order: patch.sort_order,
          };
      const { error } = await service.from('lead_source_channels').update(row).eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message.includes('unique') ? 'Mã kênh (value) đã tồn tại.' : error.message }, { status: 400 });
      await writeAudit(service, userId, 'lead_source.update', 'lead_source_channel', body.id, row);
      return NextResponse.json({ success: true });
    }

    // create — kênh tự thêm (is_builtin = false). value sinh từ nhập tay hoặc slug của label.
    const value = String(body.value ?? '').trim() || `${platformKey}_${slug(label)}`;
    if (!value) return NextResponse.json({ error: 'Không tạo được mã kênh.' }, { status: 400 });
    const row = {
      platform_key: platformKey,
      platform_name: platformName,
      value,
      label,
      is_builtin: false,
      is_active: body.is_active === undefined ? true : !!body.is_active,
      digital: body.digital === undefined ? true : !!body.digital,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
    };
    const { data, error } = await service.from('lead_source_channels').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message.includes('unique') ? 'Mã kênh (value) đã tồn tại.' : error.message }, { status: 400 });
    await writeAudit(service, userId, 'lead_source.create', 'lead_source_channel', data.id, row);
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
