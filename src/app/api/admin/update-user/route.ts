import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import { roleNeedsShowroom, roleNeedsBrand, roleNeedsSalesTeam } from '@/lib/nav';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { userId, full_name, role, showroom_id, brand_id, sales_team_id, is_active, assign_share_pct } = body as {
      userId: string;
      full_name?: string;
      role?: UserRole;
      showroom_id?: string | null;
      brand_id?: string | null;
      sales_team_id?: string | null;
      is_active?: boolean;
      assign_share_pct?: number;
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
    // Nếu đổi phòng, phòng phải thuộc công ty của admin → suy ra showroom + thương hiệu.
    let teamShowroomId: string | null = null;
    let teamBrandId: string | null = null;
    if (sales_team_id) {
      const { data: team } = await service.from('sales_teams')
        .select('id, showroom_id, brand_id').eq('id', sales_team_id).eq('company_id', caller.company_id).maybeSingle();
      if (!team) return NextResponse.json({ error: 'Phòng bán hàng không thuộc công ty của bạn.' }, { status: 400 });
      teamShowroomId = team.showroom_id;
      teamBrandId = team.brand_id;
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
      const needsTeam = roleNeedsSalesTeam(role);
      if (needsTeam) {
        // TVBH/TP Phòng: chỉ chọn phòng → showroom + thương hiệu suy từ phòng.
        if (!sales_team_id) {
          return NextResponse.json({ error: 'Vai trò này bắt buộc gán 1 phòng bán hàng.' }, { status: 400 });
        }
        updates.sales_team_id = sales_team_id;
        updates.showroom_id = teamShowroomId;
        updates.brand_id = teamBrandId;
      } else {
        if (roleNeedsShowroom(role) && !showroom_id) {
          return NextResponse.json({ error: 'Vai trò này bắt buộc gán showroom.' }, { status: 400 });
        }
        if (roleNeedsBrand(role) && !brand_id) {
          return NextResponse.json({ error: 'Vai trò này bắt buộc gán thương hiệu.' }, { status: 400 });
        }
        updates.sales_team_id = null;
        updates.showroom_id = roleNeedsShowroom(role) ? (showroom_id ?? null) : null;
        updates.brand_id = roleNeedsBrand(role) ? (brand_id ?? null) : null;
      }
    } else {
      if (sales_team_id !== undefined) {
        updates.sales_team_id = sales_team_id;
        if (sales_team_id) { updates.showroom_id = teamShowroomId; updates.brand_id = teamBrandId; }
      }
      if (showroom_id !== undefined) updates.showroom_id = showroom_id;
      if (brand_id !== undefined) updates.brand_id = brand_id;
    }
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    // % chỉ tiêu nhận lead trong phòng (dùng khi phòng chia theo tỷ lệ).
    if (Number.isFinite(Number(assign_share_pct))) {
      updates.assign_share_pct = Math.max(0, Number(assign_share_pct));
    }

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
