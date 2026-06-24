import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userId } = (await request.json()) as { userId: string };
    if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 });
    if (userId === user.id) {
      return NextResponse.json({ error: 'Không thể xoá chính mình.' }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: caller } = await service.from('users').select('role').eq('id', user.id).maybeSingle();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Vô hiệu hoá hồ sơ (giữ row cho audit + FK leads.assigned_to), rồi xoá đăng nhập auth.
    const { error: profileError } = await service.from('users').update({ is_active: false }).eq('id', userId);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const { error: authError } = await service.auth.admin.deleteUser(userId);
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
