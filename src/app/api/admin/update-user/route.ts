import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import { roleNeedsShowroom, roleNeedsBrand, roleNeedsSalesTeam, isCreatableRole } from '@/lib/nav';
import { usernameToEmail } from '@/lib/account-email';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { userId, full_name, email, role, sales_team_id, is_active, assign_share_pct } = body as {
      userId: string;
      full_name?: string;
      email?: string;
      role?: UserRole;
      sales_team_id?: string | null;
      is_active?: boolean;
      assign_share_pct?: number;
    };
    // Đa phạm vi: form gửi MẢNG brand_ids/showroom_ids.
    const brand_ids: string[] = Array.isArray(body.brand_ids) ? body.brand_ids.filter(Boolean) : [];
    const showroom_ids: string[] = Array.isArray(body.showroom_ids) ? body.showroom_ids.filter(Boolean) : [];
    if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 });
    // Chặn cứng: không gán platform_owner / vai trò không hợp lệ qua UI.
    if (role && !isCreatableRole(role)) {
      return NextResponse.json({ error: 'Vai trò không hợp lệ.' }, { status: 403 });
    }

    const service = createServiceClient();
    const { data: caller } = await service.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Cô lập đa công ty: chỉ được sửa tài khoản thuộc CÙNG công ty với admin.
    const { data: target } = await service.from('users').select('company_id, email').eq('id', userId).maybeSingle();
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
    // Nếu đổi showroom, mọi showroom phải thuộc công ty của admin (brands là master toàn cục).
    if (showroom_ids.length > 0) {
      const { data: srs } = await service.from('showrooms')
        .select('id').in('id', showroom_ids).eq('company_id', caller.company_id);
      if (!srs || srs.length !== showroom_ids.length) {
        return NextResponse.json({ error: 'Có showroom không thuộc công ty của bạn.' }, { status: 400 });
      }
    }

    const updates: Record<string, unknown> = {};
    // Junction sẽ đồng bộ lại khi đổi role HOẶC khi đổi phạm vi (gửi kèm mảng).
    let syncBrands: string[] | null = null;
    let syncShowrooms: string[] | null = null;
    if (typeof full_name === 'string' && full_name.trim()) updates.full_name = full_name.trim();
    // Đổi tên đăng nhập (email): cập nhật cả auth.users (đăng nhập) lẫn hồ sơ CRM.
    if (typeof email === 'string' && email.trim()) {
      const cleanEmail = usernameToEmail(email);
      if (cleanEmail !== target.email) {
        const { data: dup } = await service.from('users')
          .select('id').eq('email', cleanEmail).neq('id', userId).maybeSingle();
        if (dup) return NextResponse.json({ error: 'Tên đăng nhập này đã có người dùng khác.' }, { status: 400 });
        const { error: authErr } = await service.auth.admin.updateUserById(userId, { email: cleanEmail, email_confirm: true });
        if (authErr) return NextResponse.json({ error: `Không đổi được tên đăng nhập: ${authErr.message}` }, { status: 400 });
        updates.email = cleanEmail;
      }
    }
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
        syncShowrooms = teamShowroomId ? [teamShowroomId] : [];
        syncBrands = teamBrandId ? [teamBrandId] : [];
      } else {
        if (roleNeedsShowroom(role) && showroom_ids.length === 0) {
          return NextResponse.json({ error: 'Vai trò này bắt buộc gán ≥1 showroom.' }, { status: 400 });
        }
        if (roleNeedsBrand(role) && brand_ids.length === 0) {
          return NextResponse.json({ error: 'Vai trò này bắt buộc gán ≥1 thương hiệu.' }, { status: 400 });
        }
        updates.sales_team_id = null;
        syncShowrooms = roleNeedsShowroom(role) ? showroom_ids : [];
        syncBrands = roleNeedsBrand(role) ? brand_ids : [];
        updates.showroom_id = syncShowrooms[0] ?? null;
        updates.brand_id = syncBrands[0] ?? null;
      }
    } else {
      // Không đổi role: chỉ cập nhật phạm vi nếu form gửi mảng.
      if (sales_team_id !== undefined) {
        updates.sales_team_id = sales_team_id;
        if (sales_team_id) {
          updates.showroom_id = teamShowroomId; updates.brand_id = teamBrandId;
          syncShowrooms = teamShowroomId ? [teamShowroomId] : [];
          syncBrands = teamBrandId ? [teamBrandId] : [];
        }
      }
      if (Array.isArray(body.showroom_ids)) {
        syncShowrooms = showroom_ids;
        updates.showroom_id = showroom_ids[0] ?? null;
      }
      if (Array.isArray(body.brand_ids)) {
        syncBrands = brand_ids;
        updates.brand_id = brand_ids[0] ?? null;
      }
    }
    if (typeof is_active === 'boolean') updates.is_active = is_active;
    // % chỉ tiêu nhận lead trong phòng (dùng khi phòng chia theo tỷ lệ).
    if (Number.isFinite(Number(assign_share_pct))) {
      updates.assign_share_pct = Math.max(0, Number(assign_share_pct));
    }

    if (Object.keys(updates).length === 0 && syncBrands === null && syncShowrooms === null) {
      return NextResponse.json({ error: 'Không có thay đổi nào.' }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await service.from('users').update(updates).eq('id', userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Đồng bộ junction: xoá hết rồi insert lại theo phạm vi mới.
    if (syncBrands !== null) {
      await service.from('user_brands').delete().eq('user_id', userId);
      if (syncBrands.length > 0) {
        await service.from('user_brands').insert(syncBrands.map((brand_id) => ({ user_id: userId, brand_id })));
      }
    }
    if (syncShowrooms !== null) {
      await service.from('user_showrooms').delete().eq('user_id', userId);
      if (syncShowrooms.length > 0) {
        await service.from('user_showrooms').insert(syncShowrooms.map((showroom_id) => ({ user_id: userId, showroom_id })));
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
