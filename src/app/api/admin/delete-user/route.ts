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
    const { data: caller } = await service.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Cô lập đa công ty: chỉ được xoá tài khoản thuộc CÙNG công ty với admin.
    const { data: target } = await service.from('users').select('company_id').eq('id', userId).maybeSingle();
    if (!target || target.company_id !== caller.company_id) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản trong công ty của bạn.' }, { status: 404 });
    }

    // Vô hiệu hoá + đánh dấu đã xoá (giữ row cho audit + FK leads.assigned_to), rồi xoá đăng nhập auth.
    const { error: profileError } = await service.from('users').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', userId);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    // Nếu auth user đã bị xoá từ lần trước thì coi như xong (idempotent) — chỉ cần profile is_active=false.
    const { error: authError } = await service.auth.admin.deleteUser(userId);
    if (authError && !/not found/i.test(authError.message)) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
