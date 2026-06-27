'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { login } from './actions';
import { usernameToEmail } from '@/lib/account-email';

const KEYFRAMES = `
  @keyframes fadeUp { from { opacity:0; transform:translate3d(0,24px,0);} to { opacity:1; transform:translate3d(0,0,0);} }
  @keyframes smoothSlideUp { from { opacity:0; transform:translate3d(0,40px,0);} to { opacity:1; transform:translate3d(0,0,0);} }
  @keyframes fadeIn { from { opacity:0;} to { opacity:1;} }
  @keyframes spin { to { transform:rotate(360deg);} }
`;

function TimeDisplay() {
  const [now, setNow] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!mounted) return null;
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = (() => {
    const s = now.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  return (
    <div style={{
      position: 'absolute', bottom: 36, left: 0, right: 0, zIndex: 20,
      display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
      animation: 'fadeIn 0.8s ease 0.3s both',
    }}>
      <div style={{
        fontSize: 'clamp(48px, 5vw, 72px)', fontWeight: 200, color: 'rgba(255,255,255,0.65)',
        letterSpacing: '-0.03em', fontFamily: '"SF Pro Display", -apple-system, sans-serif', lineHeight: 1,
      }}>{timeStr}</div>
      <div style={{ fontSize: 15, fontWeight: 400, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em', marginTop: 8 }}>{dateStr}</div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{
      marginTop: 6, padding: '13px', borderRadius: 12, border: 'none',
      background: 'linear-gradient(135deg, #004B9B 0%, #0468BF 100%)', color: '#fff',
      fontSize: 15, fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer',
      letterSpacing: '0.02em', boxShadow: '0 4px 14px rgba(0,75,155,0.3)',
      transition: 'opacity 0.15s ease', opacity: pending ? 0.7 : 1,
    }}>
      {pending
        ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
            Đang đăng nhập...
          </span>
        : 'Đăng nhập hệ thống'}
    </button>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const errorCode = params.get('error');
  const tenantUnknown = params.get('tenant') === 'unknown';
  // Thông báo phân biệt rõ: sai công ty / tên miền chưa kích hoạt / sai thông tin đăng nhập.
  const errorMsg = errorCode === 'wrongtenant'
    ? 'Tài khoản của bạn không thuộc đơn vị này. Vui lòng đăng nhập tại địa chỉ truy cập của đơn vị mình.'
    : tenantUnknown
    ? 'Tên miền truy cập chưa được kích hoạt. Vui lòng liên hệ quản trị hệ thống.'
    : errorCode
    ? 'Tài khoản hoặc mật khẩu không chính xác.'
    : null;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mounted, setMounted] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}>

        {/* LEFT PANEL */}
        <div style={{ flex: 1.4, position: 'relative', overflow: 'hidden', background: 'radial-gradient(circle at 30% 70%, #0468BF 0%, #001a3d 60%)' }}>
          <div style={{
            position: 'absolute', inset: -80, zIndex: 2,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'absolute', top: 32, left: 36, zIndex: 20, animation: mounted ? 'fadeIn 0.6s ease 0.1s both' : 'none' }}>
            <img src="https://thacoautohanoi.vn/storage/logo/header-website.webp" alt="Thaco Auto" style={{ height: 24, objectFit: 'contain', opacity: 0.85 }} />
          </div>
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            animation: mounted ? 'smoothSlideUp 1s cubic-bezier(0.16,1,0.3,1) 0.1s both' : 'none',
          }}>
            <h1 style={{
              margin: 0, fontSize: 'clamp(18px, 2.8vw, 38px)', fontWeight: 300, color: '#fff',
              letterSpacing: '0.28em', textTransform: 'uppercase', fontFamily: '"SF Pro Display", -apple-system, sans-serif',
              textShadow: '0 2px 20px rgba(0,0,0,0.25)', textAlign: 'center', padding: '0 24px',
            }}>Quản Lý Khách Hàng</h1>
            <div style={{ width: 120, height: 1, marginTop: 18, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)' }} />
          </div>
          <TimeDisplay />
        </div>

        {/* RIGHT PANEL */}
        <div style={{ width: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #004B9B 0%, #0468BF 100%)' }} />
          <div style={{ width: '100%', maxWidth: 360, padding: '0 32px', animation: mounted ? 'fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.15s both' : 'none' }}>
            <div style={{ marginBottom: 36, textAlign: 'center' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #004B9B, #0468BF)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 6px 20px rgba(0,75,155,0.22)',
              }}>
                <svg width="26" height="26" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' }}>Đăng nhập</h2>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.55 }}>Hệ thống CRM quản lý khách hàng đa kênh</p>
            </div>

            <form action={login} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <input type="hidden" name="email" value={usernameToEmail(username)} />
              <FloatInput id="login-user" type="text" label="Tên đăng nhập" value={username} onChange={setUsername}
                focused={focused === 'email'} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                autoComplete="username" />
              <FloatInput id="login-pass" name="password" type="password" label="Mật khẩu" value={password} onChange={setPassword}
                focused={focused === 'password'} onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                autoComplete="current-password" />

              {errorMsg && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
                  background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, fontWeight: 500, color: '#dc2626',
                }}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {errorMsg}
                </div>
              )}

              <SubmitButton />

              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                  Quên mật khẩu? Liên hệ quản trị hệ thống.
                </span>
              </div>
            </form>

            <div style={{ marginTop: 40, textAlign: 'center', animation: mounted ? 'fadeIn 0.6s ease 0.6s both' : 'none' }}>
              <img src="https://thacoautohanoi.vn/storage/logo/header-website.webp" alt="Thaco Auto" style={{ height: 22, opacity: 0.35, filter: 'grayscale(1)' }} />
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 16, fontSize: 10, color: '#cbd5e1' }}>© 2026 Newtab · Thiết kế &amp; phát triển hệ thống</div>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function FloatInput({
  id, name, type, label, value, onChange, focused, onFocus, onBlur, autoComplete, suffix,
}: {
  id: string; name?: string; type: string; label: string; value: string;
  onChange: (v: string) => void; focused: boolean;
  onFocus: () => void; onBlur: () => void; autoComplete?: string; suffix?: string;
}) {
  const lifted = focused || value.length > 0;
  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: 'stretch', borderRadius: 12,
      border: `1.5px solid ${focused ? '#004B9B' : 'rgba(0,0,0,0.1)'}`, background: '#f8fafc',
      boxShadow: focused ? '0 0 0 4px rgba(0,75,155,0.08)' : 'none',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease', overflow: 'hidden',
    }}>
      <input id={id} name={name} type={type} value={value} onChange={(e) => onChange(e.target.value)} required
        autoComplete={autoComplete} onFocus={onFocus} onBlur={onBlur}
        style={{
          flex: 1, minWidth: 0, padding: '21px 16px 9px', border: 'none', fontSize: 15, fontWeight: 500,
          outline: 'none', background: 'transparent', color: '#0f172a',
          letterSpacing: (type === 'password' && value) ? '0.15em' : 'normal',
        }} />
      {suffix && (
        <span style={{
          padding: '22px 14px 9px 12px', borderLeft: '1px solid rgba(0,0,0,0.07)', fontSize: 13,
          fontWeight: 400, color: '#94a3b8', whiteSpace: 'nowrap', userSelect: 'none', background: 'rgba(0,0,0,0.015)',
        }}>{suffix}</span>
      )}
      <label htmlFor={id} style={{
        position: 'absolute', left: 16, top: lifted ? 7 : 15, fontSize: lifted ? 11 : 15,
        fontWeight: lifted ? 600 : 400, color: focused ? '#004B9B' : '#94a3b8', pointerEvents: 'none',
        transition: 'top 0.18s ease, font-size 0.18s ease, color 0.18s ease',
      }}>{label}</label>
    </div>
  );
}
