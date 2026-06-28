import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveZaloBotCompany } from '@/lib/zalo-bot-guard';
import { callGateway } from '@/lib/zalo-gateway';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = createServiceClient();
  const { data: me } = await service.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  const requested = new URL(request.url).searchParams.get('companyId');
  const r = resolveZaloBotCompany({
    role: me?.role ?? null, callerCompanyId: me?.company_id ?? null, requestedCompanyId: requested,
  });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'forbidden' ? 403 : 400 });

  const g = await callGateway('/login/status', { query: { companyId: r.companyId } });
  return NextResponse.json(g.data, { status: g.status });
}
