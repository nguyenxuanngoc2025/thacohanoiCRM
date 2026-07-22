import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST: xoá đăng ký theo endpoint (chỉ của chính mình — lọc thêm user_id để chắc chắn).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { endpoint?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const endpoint = body.endpoint?.trim();
  if (!endpoint) return NextResponse.json({ error: 'thieu endpoint' }, { status: 400 });

  const service = createServiceClient();
  await service.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
  return NextResponse.json({ success: true });
}
