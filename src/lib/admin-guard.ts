import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export type AdminContext = {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  companyId: string | null;
};

// Guard dùng chung cho mọi API admin cấu hình.
// Trả { ctx } nếu là admin, ngược lại { error } để route trả thẳng về client.
export async function requireAdmin(): Promise<
  { ctx: AdminContext; error?: never } | { ctx?: never; error: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const service = createServiceClient();
  const { data: caller } = await service
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!caller || caller.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    ctx: {
      service,
      userId: user.id,
      companyId: (caller.company_id as string | null) ?? null,
    },
  };
}
