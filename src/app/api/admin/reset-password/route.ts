import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userId, newPassword } = (await request.json()) as { userId: string; newPassword: string };
    if (!userId || !newPassword) return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    if (newPassword.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự.' }, { status: 400 });

    const service = createServiceClient();
    const { data: caller } = await service.from('users').select('role').eq('id', user.id).maybeSingle();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await service.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
