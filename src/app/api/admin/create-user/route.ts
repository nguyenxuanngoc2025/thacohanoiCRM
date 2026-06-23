import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { email, full_name, role, company_id, showroom_id } = body as {
      email: string; full_name: string; role: UserRole;
      company_id: string; showroom_id?: string | null;
    };
    if (!email || !full_name || !role || !company_id) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: caller } = await service.from('users').select('role').eq('id', user.id).maybeSingle();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Tạo auth user với metadata app='crm' → trigger Budget bỏ qua
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: 'thaco123',
      email_confirm: true,
      user_metadata: { app: 'crm', full_name },
    });
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

    const { error: profileError } = await service.from('users').insert({
      id: authData.user.id,
      email: email.toLowerCase().trim(),
      full_name,
      role,
      company_id,
      showroom_id: showroom_id ?? null,
      is_active: true,
    });
    if (profileError) {
      await service.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId: authData.user.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
