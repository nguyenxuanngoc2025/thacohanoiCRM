# Bù tên Zalo cho lead khuyết tên — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead Facebook khuyết tên / tên rác → bot Zalo tra `findUser(SĐT)` lấy tên hiển thị, ghi vào `leads.full_name` và hiện tên thật trong tin "LEAD MỚI" gửi nhóm.

**Architecture:** Chỉ bot VPS có phiên Zalo nên việc tra cứu gom ở bot. App CRM phát hiện lead tên-xấu (helper `looksLikePersonName`) và kèm khối `enrich` vào payload thông báo `new_lead`. Bot, trước khi gửi tin, nếu có `enrich` thì `findUser` → cập nhật DB → thay tên trong text → gửi. Tra trước, báo sau.

**Tech Stack:** Next.js 16 + TypeScript + vitest (app CRM); Node.js ESM + zca-js 2.1.2 + supabase-js (bot VPS, `/opt/zca-bot/index.mjs`).

---

## File Structure

- **Create** `src/lib/person-name.ts` — helper `looksLikePersonName(name): boolean`. Một trách nhiệm: phân loại tên người vs tên rác.
- **Create** `src/lib/person-name.test.ts` — unit test thuần cho helper.
- **Modify** `src/lib/ingest.ts:181-208` — khi tên xấu, kèm `enrich: { leadId, phone, badName }` vào payload notification.
- **Modify** `/opt/zca-bot/index.mjs` (VPS) — thêm `maybeEnrich()` chạy trước `sendMessage` cho tin có `enrich`. Deploy thủ công qua scp/ssh.

---

## Task 1: Helper `looksLikePersonName`

**Files:**
- Create: `src/lib/person-name.ts`
- Test: `src/lib/person-name.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, it, expect } from 'vitest';
import { looksLikePersonName } from './person-name';

describe('looksLikePersonName', () => {
  it('tên người thật → true (giữ nguyên, không tra)', () => {
    expect(looksLikePersonName('Nguyễn Văn A')).toBe(true);
    expect(looksLikePersonName('Nguyễn tá quang')).toBe(true);
    expect(looksLikePersonName('Lão Già')).toBe(true); // biệt danh vẫn coi là tên người
  });

  it('trống / null / placeholder → false (cần tra)', () => {
    expect(looksLikePersonName(null)).toBe(false);
    expect(looksLikePersonName('')).toBe(false);
    expect(looksLikePersonName('   ')).toBe(false);
    expect(looksLikePersonName('Khách lẻ')).toBe(false);
    expect(looksLikePersonName('khách hàng')).toBe(false); // không phân biệt hoa thường
  });

  it('slug form có gạch dưới → false (cần tra)', () => {
    expect(looksLikePersonName('nhận_báo_giá_lăn_bánh_kia_')).toBe(false);
    expect(looksLikePersonName('form_dang_ky')).toBe(false);
  });

  it('chứa từ khoá marketing (có/không dấu) → false (cần tra)', () => {
    expect(looksLikePersonName('Báo giá lăn bánh')).toBe(false);
    expect(looksLikePersonName('bao gia xe')).toBe(false);
    expect(looksLikePersonName('Đăng ký nhận ưu đãi')).toBe(false);
    expect(looksLikePersonName('khuyen mai thang 6')).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/lib/person-name.test.ts`
Expected: FAIL — "looksLikePersonName is not a function / cannot find module".

- [ ] **Step 3: Viết implementation tối thiểu**

```ts
// Phân loại: tên có phải tên người không. False = tên rác (trống/placeholder/slug/
// từ khoá marketing) → cần tra Zalo bù tên. True = giữ nguyên, không tra.

const PLACEHOLDERS = ['khách lẻ', 'khách hàng'];

// Từ khoá marketing (dạng đã bỏ dấu, lowercase) — so trên chuỗi đã bỏ dấu.
const MARKETING = [
  'bao gia', 'lan banh', 'khuyen mai', 'nhan', 'dang ky', 'form', 'uu dai',
];

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export function looksLikePersonName(name: string | null | undefined): boolean {
  const raw = (name ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (PLACEHOLDERS.includes(lower)) return false;
  if (raw.includes('_')) return false;
  const noDiac = stripDiacritics(lower);
  if (MARKETING.some((kw) => noDiac.includes(kw))) return false;
  return true;
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run src/lib/person-name.test.ts`
Expected: PASS — 4 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/person-name.ts src/lib/person-name.test.ts
git commit -m "feat(lead): helper looksLikePersonName phân loại tên rác cần tra Zalo"
```

---

## Task 2: Kèm `enrich` vào payload notification khi tên xấu (ingest)

**Files:**
- Modify: `src/lib/ingest.ts` (khối tạo notification, hiện ở dòng 181-208)

- [ ] **Step 1: Sửa import + render → kèm enrich**

Ở đầu file, thêm import (cạnh import `normalizePhone`):

```ts
import { looksLikePersonName } from '@/lib/person-name';
```

Thay khối `if (targets.length > 0) { ... }` (hiện dòng 181-208) bằng:

```ts
  if (targets.length > 0) {
    // Tên showroom + TVBH để render text (1 truy vấn mỗi loại)
    const { data: srRow } = await db
      .from('showrooms').select('name').eq('id', chosenShowroomId).maybeSingle();
    const assigneeName = assignedTo
      ? (await db.from('users').select('full_name').eq('id', assignedTo).maybeSingle()).data?.full_name ?? null
      : null;

    const fullName = payload.full_name ?? null;
    const { renderNewLead } = await import('@/lib/notify-templates');
    const text = renderNewLead({
      showroom: srRow?.name ?? 'Showroom',
      fullName,
      phone,
      source: payload.source ?? 'facebook',
      model: null,
      assignee: assigneeName,
    });

    // Tên rác → kèm enrich để bot tra Zalo bù tên TRƯỚC khi gửi.
    // badName = đúng chuỗi tên đang nằm trong text (để bot replace chính xác).
    const enrich = !looksLikePersonName(fullName)
      ? { leadId: inserted.id, phone, badName: (fullName?.trim() || 'Khách lẻ') }
      : null;

    await db.from('notifications').insert(
      targets.map((c) => ({
        lead_id: inserted.id,
        channel: c.channel,
        channel_id: c.id,
        status: 'pending',
        payload: { event: 'new_lead', leadId: inserted.id, target: c.target, text, ...(enrich ? { enrich } : {}) },
      }))
    );
  }
```

Lưu ý: `renderNewLead` dùng `fullName?.trim() || 'Khách lẻ'` cho dòng "KH:", nên khi `fullName` trống thì tên trong text = "Khách lẻ" → `badName` đặt đúng "Khách lẻ" để bot replace khớp.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -vE "\.next/dev/types" | grep "error TS"`
Expected: KHÔNG dòng nào (không lỗi type trong code của ta).

- [ ] **Step 3: Chạy lại toàn bộ test app cho chắc**

Run: `npx vitest run`
Expected: PASS toàn bộ (gồm person-name + notify-templates cũ).

- [ ] **Step 4: Commit**

```bash
git add src/lib/ingest.ts
git commit -m "feat(ingest): kèm enrich vào payload khi lead tên rác để bot tra Zalo"
```

- [ ] **Step 5: Deploy app CRM**

```bash
git push origin master:main
```
Hostinger tự build + deploy. Chờ deploy xong (curl webhook verify 200 như mọi lần).

---

## Task 3: Bot VPS — `maybeEnrich` tra findUser trước khi gửi

**Files:**
- Modify: `/opt/zca-bot/index.mjs` (trên VPS 145.79.8.92)

> Quy trình sửa bot: `scp` file về máy sửa, hoặc sửa trực tiếp; sau đó
> `systemctl restart zca-bot`. KHÔNG cần quét QR lại (cred đã lưu).

- [ ] **Step 1: Xác minh shape trả về của `findUser`**

Trước khi code, xác định đúng tên trường chứa tên hiển thị:

Run trên VPS:
```bash
grep -roE "(display_name|zalo_name|displayName|username|name)" /opt/zca-bot/node_modules/zca-js/dist/ | sed 's/.*://' | sort | uniq -c | sort -rn | head
```
Ghi lại các tên trường khả dĩ. (zca-js thường trả `display_name` và/hoặc `zalo_name`.)
Code Step 3 đã thử lần lượt nhiều trường nên không phụ thuộc 1 tên cứng — bước này chỉ để chắc chắn không bỏ sót trường chính.

- [ ] **Step 2: Thêm hàm `maybeEnrich` vào index.mjs**

Thêm hàm này NGAY TRÊN hàm `tick`:

```js
// Lead tên rác (payload.enrich) → tra Zalo bù tên TRƯỚC khi gửi.
// Trả về text (đã thay tên nếu tra được), luôn an toàn — lỗi thì giữ text gốc.
function pickZaloName(u) {
  if (!u) return null;
  const cand = u.display_name || u.zalo_name || u.displayName || u.username || u.name;
  const s = (typeof cand === 'string' ? cand : '').trim();
  return s || null;
}

async function maybeEnrich(api, n) {
  let text = n.payload?.text;
  const e = n.payload?.enrich;
  if (!e?.phone || !e?.leadId || !e?.badName) return text;

  // +84... → 0... (Zalo nhận SĐT nội địa)
  const localPhone = e.phone.startsWith('+84') ? '0' + e.phone.slice(3) : e.phone;
  try {
    const found = await api.findUser(localPhone);
    const zaloName = pickZaloName(found);
    if (zaloName) {
      // Chỉ ghi đè nếu tên hiện tại VẪN = badName (tránh đè tên người vừa sửa tay).
      const { data: lead } = await db.from('leads').select('full_name').eq('id', e.leadId).maybeSingle();
      if (lead && lead.full_name === e.badName) {
        await db.from('leads').update({ full_name: zaloName }).eq('id', e.leadId);
        await db.from('lead_logs').insert({
          lead_id: e.leadId, type: 'system',
          content: `Bù tên từ Zalo: ${e.badName} → ${zaloName}`,
        });
      }
      text = text.replace(e.badName, zaloName);
      console.log('[zca-bot] bù tên Zalo', e.leadId, e.badName, '→', zaloName);
    } else {
      await db.from('lead_logs').insert({
        lead_id: e.leadId, type: 'system', content: 'SĐT không có Zalo / tên ẩn — giữ tên gốc.',
      });
      console.log('[zca-bot] không tra được tên Zalo', e.leadId, localPhone);
    }
  } catch (err) {
    console.error('[zca-bot] findUser lỗi', e.leadId, err?.message);
  }
  return text;
}
```

- [ ] **Step 3: Gọi `maybeEnrich` trong vòng gửi**

Trong hàm `tick`, ĐANG có:

```js
  for (const n of pending ?? []) {
    const text = n.payload?.text;
    const groupId = await resolveTarget(n);
    if (!text || !groupId) {
```

Sửa thành (đổi `const text` → `let text`, thêm enrich sau khi đã chắc có groupId):

```js
  for (const n of pending ?? []) {
    let text = n.payload?.text;
    const groupId = await resolveTarget(n);
    if (!text || !groupId) {
```

Và NGAY TRƯỚC khối `try { await api.sendMessage(...) }`, chèn:

```js
    // Bù tên Zalo nếu là tin new_lead có enrich (tra trước, gửi tên thật).
    text = await maybeEnrich(api, n);
```

(Khối `try` giữ nguyên, vẫn `await api.sendMessage({ msg: text }, groupId, 1);`.)

- [ ] **Step 4: Restart bot**

Run trên VPS:
```bash
systemctl restart zca-bot && sleep 3 && systemctl is-active zca-bot && journalctl -u zca-bot -n 5 --no-pager
```
Expected: `active` + log "[zca-bot] bắt đầu poll" (đăng nhập bằng cred, không cần QR).

- [ ] **Step 5: Test thủ công e2e (1 lead tên rác có Zalo)**

Trên máy dev, chèn 1 notification test mô phỏng lead tên rác với SĐT THẬT có Zalo
(dùng SĐT của chính user để chắc chắn có Zalo), rồi quan sát:

```bash
# (script tạm, xoá sau) — chèn notification new_lead có enrich, SĐT thật có Zalo
node scripts/_tmp-enrich-test.mjs   # tự viết theo mẫu config cũ: insert notifications
                                    # payload={event:'new_lead', target:group_id, text:'LEAD MỚI — ...\nKH: Khách lẻ · <maskphone>...',
                                    #          enrich:{leadId:<id lead test>, phone:'+84<sđt thật>', badName:'Khách lẻ'}}
```

Quan sát `journalctl -u zca-bot -f` trên VPS:
- Thấy `[zca-bot] bù tên Zalo <leadId> Khách lẻ → <Tên thật>`
- Tin vào nhóm hiển thị tên thật thay vì "Khách lẻ".
- Query `leads.full_name` của lead test = tên Zalo; `lead_logs` có dòng "Bù tên từ Zalo".

Test ca SĐT KHÔNG có Zalo (vd số ngẫu nhiên hợp lệ): thấy log "không tra được",
tin vẫn gửi với tên gốc, không crash.

Dọn: xoá lead test + notification test + script tạm sau khi xong.

- [ ] **Step 6: Lưu bản bot vào repo để versioned**

Copy bản `/opt/zca-bot/index.mjs` đã sửa về `app/zca-bot/index.mjs` trong repo (nguồn versioned), commit:

```bash
git add zca-bot/index.mjs
git commit -m "feat(zca-bot): tra findUser bù tên Zalo cho lead tên rác trước khi gửi"
```

---

## Self-Review Notes

- **Spec coverage:** QĐ1 (chỉ tra tên xấu) = Task 1 + enrich-guard Task 2. QĐ2 (ghi `leads.full_name` + log gốc) = Task 3 Step 2. QĐ3 (tra trước báo sau) = Task 3 Step 3 (maybeEnrich trước sendMessage). QĐ4 (không bù lead cũ) = chỉ tác động lead mới qua ingest, không có quét lead cũ. QĐ5 (app hiện tên mới) = ghi `leads.full_name`.
- **Phone format:** convert `+84` → `0` trong bot (Task 3 Step 2) khớp `formatPhoneDisplay` của app.
- **Overwrite guard:** chỉ ghi đè khi `full_name === badName` → an toàn nếu người dùng vừa sửa tay.
- **findUser field name:** Task 3 Step 1 xác minh; `pickZaloName` thử nhiều trường nên bền.
