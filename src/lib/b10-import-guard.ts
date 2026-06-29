// app/src/lib/b10-import-guard.ts
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { type UserRole } from '@/types/database';

/** Vai trò được xem trang Đối soát + import (xem được SĐT trên B10). */
export const B10_IMPORT_ROLES = new Set<UserRole>([
  'tp_phong', 'gd_showroom', 'gd_brand', 'gd_cty', 'admin',
]);

export type B10Context = {
  supabase: Awaited<ReturnType<typeof createClient>>; // user session (RLS-scoped)
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  companyId: string;
};

/** Cho phép khi: đã đăng nhập + vai trò trong danh sách + công ty bật b10_enabled. */
export async function requireB10Importer(): Promise<
  { ctx: B10Context; error?: never } | { ctx?: never; error: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const service = createServiceClient();
  const { data: caller } = await service
    .from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (!caller || !B10_IMPORT_ROLES.has(caller.role as UserRole) || !caller.company_id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const { data: company } = await service
    .from('companies').select('b10_enabled').eq('id', caller.company_id).maybeSingle();
  if (!company?.b10_enabled) {
    return { error: NextResponse.json({ error: 'Tính năng chưa bật cho công ty' }, { status: 403 }) };
  }

  return {
    ctx: { supabase, service, userId: user.id, companyId: caller.company_id as string },
  };
}
