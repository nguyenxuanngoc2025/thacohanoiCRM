import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import { roleNeedsShowroom, roleNeedsBrand, roleNeedsSalesTeam } from '@/lib/nav';
import { usernameToEmail } from '@/lib/account-email';

// auth.users không truy vấn theo email trực tiếp qua admin SDK → phân trang listUsers.
async function findAuthUserIdByEmail(
  service: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { email, full_name, role, showroom_id, brand_id, sales_team_id } = body as {
      email: string; full_name: string; role: UserRole;
      showroom_id?: string | null; brand_id?: string | null; sales_team_id?: string | null;
    };
    if (!email || !full_name || !role) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }
    // TVBH & TP Phòng thuộc đúng 1 phòng bán → form chỉ chọn phòng, suy ra showroom + thương hiệu.
    const needsTeam = roleNeedsSalesTeam(role);
    if (needsTeam && !sales_team_id) {
      return NextResponse.json({ error: 'Vai trò này bắt buộc gán 1 phòng bán hàng.' }, { status: 400 });
    }
    if (!needsTeam && roleNeedsShowroom(role) && !showroom_id) {
      return NextResponse.json({ error: 'Vai trò này bắt buộc gán showroom.' }, { status: 400 });
    }
    if (!needsTeam && roleNeedsBrand(role) && !brand_id) {
      return NextResponse.json({ error: 'Vai trò này bắt buộc gán thương hiệu.' }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: caller } = await service.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Cô lập đa công ty: LUÔN gán user mới vào ĐÚNG công ty của admin đang thao tác.
    // Bỏ qua company_id gửi từ client để admin không thể tạo tài khoản cho công ty khác.
    const company_id = caller.company_id as string | null;
    if (!company_id) {
      return NextResponse.json({ error: 'Tài khoản admin chưa gắn công ty.' }, { status: 400 });
    }
    // TVBH/TP Phòng: suy showroom + thương hiệu từ phòng (đã kiểm tra thuộc đúng công ty).
    let finalShowroomId: string | null = roleNeedsShowroom(role) ? (showroom_id ?? null) : null;
    let finalBrandId: string | null = roleNeedsBrand(role) ? (brand_id ?? null) : null;
    let finalTeamId: string | null = null;
    if (needsTeam) {
      const { data: team } = await service.from('sales_teams')
        .select('id, showroom_id, brand_id, company_id')
        .eq('id', sales_team_id!).eq('company_id', company_id).maybeSingle();
      if (!team) return NextResponse.json({ error: 'Phòng bán hàng không thuộc công ty của bạn.' }, { status: 400 });
      finalTeamId = team.id;
      finalShowroomId = team.showroom_id;
      finalBrandId = team.brand_id;
    } else if (finalShowroomId) {
      // Showroom (nếu có) phải thuộc công ty của admin.
      const { data: sr } = await service.from('showrooms').select('id').eq('id', finalShowroomId).eq('company_id', company_id).maybeSingle();
      if (!sr) return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 400 });
    }

    // Người dùng có thể nhập tên trơn (vd "nguyenvana") → tự ghép đuôi @thaco.com.vn.
    const cleanEmail = usernameToEmail(email);

    // auth.users dùng CHUNG mọi app trên Supabase này. Tạo mới; nếu email đã có
    // (tài khoản app khác) thì gắn profile CRM vào auth id sẵn có → đăng nhập chung 2 app.
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: cleanEmail,
      password: 'thaco123',
      email_confirm: true,
      user_metadata: { app: 'crm', full_name },
    });

    let authId: string | null = authData?.user?.id ?? null;
    let createdNewAuth = !authError;
    if (authError) {
      const existingId = await findAuthUserIdByEmail(service, cleanEmail);
      if (!existingId) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
      authId = existingId;
      createdNewAuth = false;
    }
    if (!authId) {
      return NextResponse.json({ error: 'Không lấy được auth id' }, { status: 500 });
    }

    // Đã có profile CRM cho id này → không tạo trùng.
    const { data: existingProfile } = await service.from('users').select('id').eq('id', authId).maybeSingle();
    if (existingProfile) {
      return NextResponse.json({ error: 'Tài khoản này đã có hồ sơ trong CRM.' }, { status: 400 });
    }

    const { error: profileError } = await service.from('users').insert({
      id: authId,
      email: cleanEmail,
      full_name,
      role,
      company_id,
      showroom_id: finalShowroomId,
      brand_id: finalBrandId,
      sales_team_id: finalTeamId,
      is_active: true,
    });
    if (profileError) {
      if (createdNewAuth) await service.auth.admin.deleteUser(authId);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId: authId, reusedAuth: !createdNewAuth });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
