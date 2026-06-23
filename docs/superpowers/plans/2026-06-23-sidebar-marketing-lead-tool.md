# Sidebar Marketing Lead Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Định vị lại CRM thành công cụ Marketing theo dõi lead — sidebar còn 3 mục, trang Lead có cờ đã/chưa liên hệ + phân loại, gỡ Dashboard/Chăm sóc.

**Architecture:** Đổi `NAV_ITEMS` + redirect mặc định sang `/leads`. Trang `/leads` (server component) fetch thêm `last_contact_at`, truyền vào client component có tab lọc liên hệ + thao tác đặt phân loại/đánh dấu liên hệ qua server action (RLS-bound `createClient`). Helper thuần `lead-status.ts` chứa danh sách phân loại + suy cờ liên hệ, có test. Gỡ route `/dashboard` và `/care`.

**Tech Stack:** Next.js 16 App Router (server actions + 'use client'), @supabase/ssr (schema `crm_thacoauto`), vitest, Tailwind v4, lucide-react.

---

### Task 1: Helper trạng thái lead (thuần, có test)

**Files:**
- Create: `src/lib/lead-status.ts`
- Test: `src/lib/lead-status.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/lib/lead-status.test.ts
import { describe, it, expect } from 'vitest';
import { STATUS_OPTIONS, isContacted, STATUS_LABEL } from './lead-status';

describe('lead-status', () => {
  it('có đúng 5 phân loại theo CHECK DB', () => {
    expect(STATUS_OPTIONS.map((s) => s.code)).toEqual([
      'KHQT', 'GDTD', 'KHĐ', 'Chưa LH được', 'Fail',
    ]);
  });

  it('nhãn nội bộ đúng cho KHĐ và GDTD', () => {
    expect(STATUS_LABEL['KHĐ']).toBe('Ký hợp đồng');
    expect(STATUS_LABEL['GDTD']).toBe('Giao dịch theo dõi');
  });

  it('isContacted theo last_contact_at', () => {
    expect(isContacted(null)).toBe(false);
    expect(isContacted('2026-06-23T03:00:00Z')).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test cho thất bại**

Run: `npx vitest run src/lib/lead-status.test.ts`
Expected: FAIL — `Cannot find module './lead-status'`.

- [ ] **Step 3: Viết implementation tối thiểu**

```ts
// src/lib/lead-status.ts
export type LeadStatus = 'KHQT' | 'GDTD' | 'KHĐ' | 'Chưa LH được' | 'Fail';

export const STATUS_LABEL: Record<LeadStatus, string> = {
  KHQT: 'Khách quan tâm',
  GDTD: 'Giao dịch theo dõi',
  'KHĐ': 'Ký hợp đồng',
  'Chưa LH được': 'Chưa liên hệ được',
  Fail: 'Loại',
};

export const STATUS_OPTIONS: { code: LeadStatus; label: string; color: string; bg: string }[] = [
  { code: 'KHQT', label: STATUS_LABEL.KHQT, color: '#1d4ed8', bg: '#eff6ff' },
  { code: 'GDTD', label: STATUS_LABEL.GDTD, color: '#b45309', bg: '#fffbeb' },
  { code: 'KHĐ', label: STATUS_LABEL['KHĐ'], color: '#047857', bg: '#ecfdf5' },
  { code: 'Chưa LH được', label: STATUS_LABEL['Chưa LH được'], color: '#475569', bg: '#f8fafc' },
  { code: 'Fail', label: STATUS_LABEL.Fail, color: '#be123c', bg: '#fff1f2' },
];

/** Cờ đã/chưa liên hệ suy từ cột last_contact_at (không thêm cột DB). */
export function isContacted(lastContactAt: string | null): boolean {
  return lastContactAt != null;
}
```

- [ ] **Step 4: Chạy test cho pass**

Run: `npx vitest run src/lib/lead-status.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-status.ts src/lib/lead-status.test.ts
git commit -m "feat(lead): helper phân loại + cờ đã/chưa liên hệ (suy từ last_contact_at)"
```

---

### Task 2: Server action cập nhật liên hệ + phân loại

**Files:**
- Create: `src/app/(dashboard)/leads/actions.ts`

RLS tự gác phạm vi: TVBH chỉ sửa được lead `assigned_to = mình`, manager trong showroom, admin toàn công ty — dùng `createClient` (cookie SSR) chứ KHÔNG `createServiceClient`.

- [ ] **Step 1: Viết server action**

```ts
// src/app/(dashboard)/leads/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { STATUS_OPTIONS, type LeadStatus } from '@/lib/lead-status';

const VALID = new Set<LeadStatus>(STATUS_OPTIONS.map((s) => s.code));

/** Đặt phân loại cho lead. Đồng thời ghi log đổi trạng thái. */
export async function setLeadStatus(leadId: string, status: LeadStatus) {
  if (!VALID.has(status)) return;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  const { data: prev } = await db.from('leads').select('status').eq('id', leadId).maybeSingle();
  const { error } = await db.from('leads').update({ status }).eq('id', leadId);
  if (error) return;

  await db.from('lead_logs').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'status_change',
    old_status: prev?.status ?? null,
    new_status: status,
    content: `Đổi phân loại sang ${status}.`,
  });
  revalidatePath('/leads');
}

/** Đánh dấu đã liên hệ (set last_contact_at = now). */
export async function markContacted(leadId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  const { error } = await db.from('leads').update({ last_contact_at: new Date().toISOString() }).eq('id', leadId);
  if (error) return;

  await db.from('lead_logs').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'contact',
    content: 'Đánh dấu đã liên hệ.',
  });
  revalidatePath('/leads');
}
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/leads/actions.ts"
git commit -m "feat(leads): server action đặt phân loại + đánh dấu đã liên hệ (RLS-bound + log)"
```

---

### Task 3: Client component bảng lead (tab lọc + thao tác)

**Files:**
- Create: `src/app/(dashboard)/leads/LeadsTable.tsx`

- [ ] **Step 1: Viết client component**

```tsx
// src/app/(dashboard)/leads/LeadsTable.tsx
'use client';

import React, { useState, useTransition } from 'react';
import { PhoneCall, Check } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';
import { STATUS_OPTIONS, isContacted, type LeadStatus } from '@/lib/lead-status';
import { setLeadStatus, markContacted } from './actions';
// Màu phân loại lấy từ STATUS_OPTIONS.

export interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  status: LeadStatus;
  created_at: string;
  last_contact_at: string | null;
}

type Tab = 'all' | 'pending' | 'contacted';

export default function LeadsTable({ leads }: { leads: LeadRow[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [pending, start] = useTransition();

  const counts = {
    all: leads.length,
    pending: leads.filter((l) => !isContacted(l.last_contact_at)).length,
    contacted: leads.filter((l) => isContacted(l.last_contact_at)).length,
  };

  const shown = leads.filter((l) =>
    tab === 'all' ? true : tab === 'contacted' ? isContacted(l.last_contact_at) : !isContacted(l.last_contact_at),
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chưa liên hệ' },
    { key: 'contacted', label: 'Đã liên hệ' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="text-sm rounded-full px-3 py-1 transition-colors"
            style={{
              fontWeight: tab === t.key ? 600 : 500,
              color: tab === t.key ? '#004B9B' : '#64748b',
              background: tab === t.key ? '#e6f0fa' : 'transparent',
            }}
          >
            {t.label} <span className="opacity-60">({counts[t.key]})</span>
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
          <tr>
            <th className="px-6 py-3 font-semibold">Khách hàng</th>
            <th className="px-4 py-3 font-semibold">SĐT</th>
            <th className="px-4 py-3 font-semibold">Nguồn</th>
            <th className="px-4 py-3 font-semibold">Liên hệ</th>
            <th className="px-4 py-3 font-semibold">Phân loại</th>
            <th className="px-4 py-3 font-semibold">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((l) => {
            const contacted = isContacted(l.last_contact_at);
            return (
              <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-6 py-3 font-medium text-slate-800">{l.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{formatPhoneDisplay(l.phone)}</td>
                <td className="px-4 py-3 text-slate-500">{l.source ?? '—'}</td>
                <td className="px-4 py-3">
                  {contacted ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <Check size={13} /> Đã liên hệ
                    </span>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => start(() => markContacted(l.id))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#004B9B] border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <PhoneCall size={12} /> Đánh dấu liên hệ
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={l.status}
                    disabled={pending}
                    onChange={(e) => start(() => setLeadStatus(l.id, e.target.value as LeadStatus))}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:border-[#004B9B] outline-none disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(l.created_at).toLocaleString('vi-VN')}</td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Không có lead nào.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/leads/LeadsTable.tsx"
git commit -m "feat(leads): bảng lead có tab lọc liên hệ + chọn phân loại + đánh dấu liên hệ"
```

---

### Task 4: Viết lại trang `/leads` (server) — dải thống kê + dùng LeadsTable

**Files:**
- Modify: `src/app/(dashboard)/leads/page.tsx` (thay toàn bộ)

- [ ] **Step 1: Thay nội dung file**

```tsx
// src/app/(dashboard)/leads/page.tsx
import { createClient } from '@/lib/supabase/server';
import LeadsTable, { type LeadRow } from './LeadsTable';
import { isContacted } from '@/lib/lead-status';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('leads')
    .select('id, full_name, phone, source, status, created_at, last_contact_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const leads = (data ?? []) as LeadRow[];
  const total = leads.length;
  const pending = leads.filter((l) => !isContacted(l.last_contact_at)).length;
  const contacted = total - pending;

  const CARDS = [
    { label: 'Tổng lead', value: total, color: '#004B9B', bg: '#e6f0fa' },
    { label: 'Chưa liên hệ', value: pending, color: '#b45309', bg: '#fffbeb' },
    { label: 'Đã liên hệ', value: contacted, color: '#047857', bg: '#ecfdf5' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Lead khách hàng</h1>
        <p className="text-sm text-slate-400 mt-0.5">Theo dõi lead đã liên hệ chưa và phân loại</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: c.color }}>{c.label}</div>
            <div className="text-3xl font-bold text-slate-900 mt-2">{c.value}</div>
            <div className="mt-3 h-1 rounded-full" style={{ background: c.bg }} />
          </div>
        ))}
      </div>

      <LeadsTable leads={leads} />
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/leads/page.tsx"
git commit -m "feat(leads): dải thống kê đã/chưa liên hệ thay trang Dashboard riêng"
```

---

### Task 5: Sidebar 3 mục + redirect mặc định `/leads`

**Files:**
- Modify: `src/lib/nav.ts:14-20`
- Modify: `src/app/page.tsx:4`
- Modify: `src/app/login/actions.ts:12`

- [ ] **Step 1: Sửa `NAV_ITEMS` trong `src/lib/nav.ts`**

Thay block (dòng 14-20):

```ts
// Menu chính sidebar — công cụ Marketing theo dõi lead. Cài đặt nằm trong avatar.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Lead', href: '/leads', icon: 'Users', roles: ALL },
  { label: 'Phân giao', href: '/assign', icon: 'UserCheck', roles: MGR },
  { label: 'Báo cáo', href: '/reports', icon: 'BarChart3', roles: MGR },
];
```

- [ ] **Step 2: Sửa redirect gốc `src/app/page.tsx`**

Đổi `redirect('/dashboard');` → `redirect('/leads');`.

- [ ] **Step 3: Sửa redirect sau login `src/app/login/actions.ts`**

Đổi `redirect('/dashboard');` (dòng 12, trong hàm `login`) → `redirect('/leads');`.

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/app/page.tsx src/app/login/actions.ts
git commit -m "feat(nav): sidebar còn 3 mục (Lead/Phân giao/Báo cáo) + redirect mặc định /leads"
```

---

### Task 6: Gỡ route `/dashboard` và `/care`

**Files:**
- Delete: `src/app/(dashboard)/dashboard/page.tsx`
- Delete: `src/app/(dashboard)/care/page.tsx`

- [ ] **Step 1: Xác nhận `/care` chỉ là placeholder**

Run: `npx grep -n "" "src/app/(dashboard)/care/page.tsx"` (hoặc đọc file). Expected: nội dung là placeholder "đang phát triển", không có logic cần giữ.

- [ ] **Step 2: Xoá 2 file**

```bash
git rm "src/app/(dashboard)/dashboard/page.tsx" "src/app/(dashboard)/care/page.tsx"
```

- [ ] **Step 3: Verify không còn tham chiếu**

Run: `npx grep -rn "/dashboard\|/care\|HeartHandshake\|LayoutDashboard" src/`
Expected: KHÔNG còn link `/dashboard` hay `/care` trong nav/redirect. Nếu còn icon `LayoutDashboard`/`HeartHandshake` chỉ trong map icon Sidebar thì để nguyên (vô hại), nhưng nav không còn dùng.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: EXIT 0, build green, không còn route `/dashboard` `/care`.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: gỡ trang Dashboard + Chăm sóc (ngoài phạm vi công cụ Marketing)"
```

---

### Task 7: Sửa nhãn nội bộ trong PipelineReference

**Files:**
- Modify: `src/components/settings/PipelineReference.tsx:9-15`

- [ ] **Step 1: Thay mảng `STATUSES`**

```ts
const STATUSES: { code: string; label: string; desc: string; color: string; bg: string }[] = [
  { code: 'KHQT', label: 'Khách quan tâm', desc: 'Lead mới — khách bày tỏ quan tâm, chờ liên hệ.', color: '#1d4ed8', bg: '#eff6ff' },
  { code: 'GDTD', label: 'Giao dịch theo dõi', desc: 'Đang theo dõi giao dịch sau khi đã liên hệ.', color: '#b45309', bg: '#fffbeb' },
  { code: 'KHĐ', label: 'Ký hợp đồng', desc: 'Khách đã ký hợp đồng.', color: '#047857', bg: '#ecfdf5' },
  { code: 'Chưa LH được', label: 'Chưa liên hệ được', desc: 'Gọi/nhắn nhưng chưa kết nối được với khách.', color: '#475569', bg: '#f8fafc' },
  { code: 'Fail', label: 'Loại', desc: 'Khách từ chối / không có nhu cầu — kết thúc.', color: '#be123c', bg: '#fff1f2' },
];
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/PipelineReference.tsx
git commit -m "fix(settings): nhãn nội bộ đúng cho KHĐ (Ký hợp đồng) + GDTD (Giao dịch theo dõi)"
```

---

## Ghi chú verify cuối (không phải task)

- Preview browser MCP KHÔNG dùng được trong môi trường này (chrome-error, không tới localhost) → verify bằng `npx tsc --noEmit` + `npm run build` + `npx vitest run`.
- DashboardShell ở `layout.tsx` đã hiển thị metrics KHQT/GDTD/KHĐ ở thanh trên — giữ nguyên, không đụng.
