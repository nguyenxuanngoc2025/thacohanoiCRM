import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServiceClient, createClient } from '@/lib/supabase/server';

// auth.users dùng CHUNG cho mọi dự án trên Supabase self-hosted này. Các schema dự án khác
// cũng có bảng users (id = auth.users.id). Nếu tài khoản còn profile ở schema khác thì login
// vẫn đang được dự án đó dùng → KHÔNG được xoá đăng nhập, chỉ thu hồi quyền trong CRM.
const SIBLING_SCHEMAS = ['erp_tb', 'mkt_budget'];

// Tài khoản còn được dự án khác dùng? Quét bảng users của từng schema anh em theo id.
async function isUsedByOtherProject(userId: string): Promise<boolean> {
  for (const schema of SIBLING_SCHEMAS) {
    const client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false }, db: { schema } }
    );
    const { data, error } = await client.from('users').select('id').eq('id', userId).maybeSingle();
    if (error) continue; // schema không có bảng users / không truy cập được → bỏ qua, coi như không dùng
    if (data) return true;
  }
  return false;
}

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

    // Vô hiệu hoá + đánh dấu đã xoá (giữ row cho audit + FK leads.assigned_to). Thao tác này đã đủ
    // chặn tài khoản dùng trong CRM (login kiểm tra is_active của profile).
    const { error: profileError } = await service.from('users').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', userId);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    // Chỉ xoá đăng nhập CHUNG khi tài khoản KHÔNG còn dùng ở dự án khác — tránh làm mất login bên đó.
    if (await isUsedByOtherProject(userId)) {
      return NextResponse.json({ success: true, authKept: true });
    }

    // Tài khoản chỉ thuộc CRM → xoá hẳn đăng nhập. Đã xoá từ trước thì coi như xong (idempotent).
    const { error: authError } = await service.auth.admin.deleteUser(userId);
    if (authError && !/not found/i.test(authError.message)) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
