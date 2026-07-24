import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith('/login');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  // /connect/* = trang công khai (vd popup chọn Google Sheet chạy ở apex, người dùng
  // không có session apex) → không tính là dashboard, không ép đăng nhập.
  const isConnect = request.nextUrl.pathname.startsWith('/connect');
  // /embed/* = nhúng iframe từ Budget; phiên đến qua postMessage (client) chứ không phải cookie
  // sẵn có → KHÔNG ép redirect /login (nếu không bridge nhận token sẽ không kịp chạy).
  const isEmbed = request.nextUrl.pathname.startsWith('/embed');
  const isDashboard = !isAuthPage && !isApiRoute && !isConnect && !isEmbed;

  // helper: redirect while preserving cookies refreshed/cleared on supabaseResponse
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user && isDashboard) {
    return redirectTo('/login');
  }

  // Co auth session nhung khong co profile trong crm_thacoauto → khong thuoc CRM
  if (user && isDashboard) {
    try {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'crm_thacoauto' } }
      );
      const { data: profile } = await admin
        .from('users')
        .select('id,is_active,role,company_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!profile || !profile.is_active) {
        await supabase.auth.signOut();
        return redirectTo('/login');
      }

      const isPlatformOwner = profile.role === 'platform_owner';
      const isAdminArea = request.nextUrl.pathname.startsWith('/admin');

      // Chan nguoi KHONG phai chu nen tang vao khu /admin
      if (isAdminArea && !isPlatformOwner) {
        return redirectTo('/leads');
      }

      // Chan dang nhap khi cong ty bi tam khoa (platform_owner khong thuoc cong ty → bo qua)
      if (!isPlatformOwner && profile.company_id) {
        const { data: company } = await admin
          .from('companies')
          .select('plan_status')
          .eq('id', profile.company_id)
          .maybeSingle();
        if (company?.plan_status === 'suspended') {
          await supabase.auth.signOut();
          return redirectTo('/login?suspended=1');
        }
      }
    } catch (e) {
      console.error('[middleware] profile check failed (allowing through):', e);
    }
  }

  if (user && isAuthPage) {
    return redirectTo('/leads');
  }

  return supabaseResponse;
}
