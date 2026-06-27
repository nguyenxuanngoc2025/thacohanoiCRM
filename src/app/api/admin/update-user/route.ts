import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import { roleNeedsShowroom, roleNeedsBrand } from '@/lib/nav';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { userId, full_name, role, showroom_id, brand_id, is_active } = body as {
      userId: string;
      full_name?: string;
      role?: UserRole;
      showroom_id?: string | null;
      brand_id?: string | null;
      is_active?: boolean;
    };
    if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 });

    const service = createServiceClient();
    const { data: caller } = await service.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Cô lập đa công ty: chỉ được sửa tài khoản thuộc CÙNG công ty với admin.
    const { data: target } = await service.from('users').select('company_id').eq('id', userId).maybeSingle();
    if (!target || target.company_id !== caller.company_id) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản trong công ty của bạn.' }, { status: 404 });
    }
    // Nếu đổi showroom, showroom phải thuộc công ty của admin.
    if (showroom_id) {
      const { data: sr } = await service.from('showrooms').select('id').eq('id', showroom_id).eq('company_id', caller.company_id).maybeSingle();
      if (!sr) return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof full_name === 'string' && full_name.trim()) updates.full_name = full_name.trim();
    if (role) {
      updates.role = role;
      // Vai trò cấp công ty → không gán; cấp showroom → bắt buộc showroom; cấp thương hiệu → bắt buộc thương hiệu
      if (roleNeedsShowroom(role) && !showroom_id) {
        return NextResponse.json({ error: 'Vai trò này bắt buộc gán showroom.' }, { status: 400 });
      }
      if (roleNeedsBrand(role) && !brand_id) {
        return NextResponse.json({ error: 'Vai trò này bắt buộc gán thương hiệu.' }, { status: 400 });
      }
      updates.showroom_id = roleNeedsShowroom(role) ? (showroom_id ?? null) : null;
      updates.brand_id = roleNeedsBrand(role) ? (brand_id ?? null) : null;
    } else {
      if (showroom_id !== undefined) updates.showroom_id = showroom_id;
      if (brand_id !== undefined) updates.brand_id = brand_id;
    }
    if (typeof is_active === 'boolean') updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Không có thay đổi nào.' }, { status: 400 });
    }

    const { error } = await service.from('users').update(updates).eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
