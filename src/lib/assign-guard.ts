import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// Guard cho các API cấu hình phân giao (cây phân giao + lịch phòng trực).
// Cho phép: admin (toàn công ty) HOẶC gd_showroom (giới hạn showroom mình phụ trách).
// showroomIds = null  → admin, toàn quyền trong công ty (không giới hạn showroom).
// showroomIds = string[] → gd_showroom, chỉ được đụng các showroom này.
export type AssignManagerContext = {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  companyId: string;
  role: 'admin' | 'gd_showroom';
  showroomIds: string[] | null;
};

export async function requireAssignManager(): Promise<
  { ctx: AssignManagerContext; error?: never } | { ctx?: never; error: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const service = createServiceClient();
  const { data: caller } = await service
    .from('users').select('role, company_id').eq('id', user.id).maybeSingle();

  if (!caller || (caller.role !== 'admin' && caller.role !== 'gd_showroom')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  const companyId = (caller.company_id as string | null) ?? null;
  if (!companyId) return { error: NextResponse.json({ error: 'Tài khoản chưa gắn công ty.' }, { status: 400 }) };

  let showroomIds: string[] | null = null;
  if (caller.role === 'gd_showroom') {
    const { data: rows } = await service
      .from('user_showrooms').select('showroom_id').eq('user_id', user.id);
    showroomIds = (rows ?? []).map((r: { showroom_id: string }) => r.showroom_id);
  }

  return {
    ctx: { service, userId: user.id, companyId, role: caller.role as 'admin' | 'gd_showroom', showroomIds },
  };
}

// Kiểm tra 1 showroom có nằm trong phạm vi caller không.
// admin (showroomIds=null) → luôn true. gd_showroom → phải thuộc danh sách phụ trách.
export function showroomInScope(ctx: AssignManagerContext, showroomId: string | null | undefined): boolean {
  if (ctx.showroomIds === null) return true;
  return !!showroomId && ctx.showroomIds.includes(showroomId);
}
