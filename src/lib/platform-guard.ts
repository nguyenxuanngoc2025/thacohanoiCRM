import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export type PlatformContext = {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
};

/**
 * Guard cho mọi route /api/platform/* — chỉ cho chủ nền tảng (role platform_owner).
 * Trả { ctx } nếu hợp lệ; ngược lại { error } để route trả thẳng về client.
 */
export async function requirePlatformOwner(): Promise<
  { ctx: PlatformContext; error?: never } | { ctx?: never; error: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const service = createServiceClient();
  const { data: caller } = await service
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!caller || caller.role !== 'platform_owner') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ctx: { service, userId: user.id } };
}

/** Đọc role của user hiện tại (dùng cho guard trang server). null nếu chưa đăng nhập. */
export async function getCurrentRole(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('users').select('role').eq('id', user.id).maybeSingle();
  return (data as { role: string } | null)?.role ?? null;
}
