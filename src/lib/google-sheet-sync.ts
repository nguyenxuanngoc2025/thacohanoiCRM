import type { createServiceClient } from '@/lib/supabase/server';
import { readSheetValues } from '@/lib/google';
import { ingestLead } from '@/lib/ingest';
import { isOnOrAfter } from '@/lib/sheet-date';
import type { AssignStrategy } from '@/lib/assign';

type Service = ReturnType<typeof createServiceClient>;

// Cấu hình ĐẦY ĐỦ của 1 tab. Mọi trường tuỳ chọn — thiếu thì kế thừa cấu hình cấp-dòng (tương thích cũ).
export interface TabCfg {
  title: string;
  source?: string | null;
  brand_id?: string | null;
  showroom_ids?: string[] | null;
  phone_col?: number | null;
  name_col?: number | null;
  note_cols?: number[];
  source_mode?: 'fixed' | 'column'; source_col?: number | null;
  model_mode?: 'auto' | 'fixed' | 'column'; model_id?: string | null; model_col?: number | null;
  date_col?: number | null; since?: string | null;
  // Định tuyến theo địa chỉ: đọc tỉnh từ 1 cột → giao về showroom của tỉnh đó.
  address_col?: number | null; address_fallback_province?: string | null;
  // Cách chia lead vào các showroom của tab + % từng showroom (dùng khi 'weighted'). Giống fanpage.
  showroom_assign_strategy?: AssignStrategy; showroom_shares?: Record<string, number>;
}

// Cấu hình 1 tab đã resolve xong (mọi trường bắt buộc có giá trị dùng được khi đồng bộ).
export interface ResolvedTab {
  title: string;
  brand_id: string | null;
  showroom_ids: string[];
  phone_col: number | null;
  name_col: number | null;
  note_cols: number[];
  source_mode: 'fixed' | 'column'; source: string | null; source_col: number | null;
  model_mode: 'auto' | 'fixed' | 'column'; model_id: string | null; model_col: number | null;
  date_col: number | null; since: string | null;
  address_col: number | null; address_fallback_province: string | null;
  showroom_assign_strategy: AssignStrategy; showroom_shares: Record<string, number>;
}

export interface SheetConfig {
  connection_id?: string;
  tabs?: (string | TabCfg)[]; tab?: string | null;
  phone_col?: number; name_col?: number | null; note_cols?: number[];
  // Nguồn: 'fixed' = gán nhãn nguồn theo từng tab; 'column' = đọc nguồn từ 1 cột.
  source_mode?: 'fixed' | 'column'; source_col?: number | null;
  // Dòng xe: 'auto' = dò từ khoá; 'fixed' = 1 dòng cố định; 'column' = đọc tên dòng từ 1 cột.
  model_mode?: 'auto' | 'fixed' | 'column'; model_id?: string | null; model_col?: number | null;
  // Mốc thời gian: chỉ nạp dòng có thời gian (cột date_col) >= since ('YYYY-MM-DD').
  // Tránh lần kết nối đầu nạp toàn bộ lead cũ → nổ thông báo. Bỏ trống = nạp tất cả (cũ).
  date_col?: number | null; since?: string | null;
  address_col?: number | null; address_fallback_province?: string | null;
  brand_id?: string | null; showroom_ids?: string[] | null; // cấp-dòng (cấu hình cũ dùng chung mọi tab)
}

/** Kết quả 1 lần đồng bộ 1 sheet: rows=dòng có SĐT, fresh=lead mới, dup=trùng, skipped=trước mốc/không ngày. */
export interface SheetSyncResult { rows: number; fresh: number; dup: number; skipped: number; errors: string[] }

// Resolve mỗi tab thành cấu hình đầy đủ: ưu tiên trường của tab, thiếu thì kế thừa cấp-dòng.
export function resolveTabConfigs(cfg: SheetConfig): ResolvedTab[] {
  const raw: TabCfg[] = cfg.tabs && cfg.tabs.length > 0
    ? cfg.tabs.map((t) => (typeof t === 'string' ? { title: t } : t))
    : cfg.tab ? [{ title: cfg.tab }] : [{ title: '' }];
  const pick = <T,>(a: T | null | undefined, b: T | null | undefined, dflt: T): T =>
    a ?? b ?? dflt;
  return raw.map((t) => ({
    title: t.title ?? '',
    brand_id: pick(t.brand_id, cfg.brand_id, null),
    showroom_ids: t.showroom_ids ?? cfg.showroom_ids ?? [],
    phone_col: pick(t.phone_col, cfg.phone_col, null),
    name_col: pick(t.name_col, cfg.name_col, null),
    note_cols: t.note_cols ?? cfg.note_cols ?? [],
    source_mode: pick(t.source_mode, cfg.source_mode, 'fixed'),
    source: t.source ?? null,
    source_col: pick(t.source_col, cfg.source_col, null),
    model_mode: pick(t.model_mode, cfg.model_mode, 'auto'),
    model_id: pick(t.model_id, cfg.model_id, null),
    model_col: pick(t.model_col, cfg.model_col, null),
    date_col: pick(t.date_col, cfg.date_col, null),
    since: pick(t.since, cfg.since, null),
    address_col: pick(t.address_col, cfg.address_col, null),
    address_fallback_province: pick(t.address_fallback_province, cfg.address_fallback_province, null),
    showroom_assign_strategy: t.showroom_assign_strategy ?? 'least_loaded',
    showroom_shares: t.showroom_shares ?? {},
  }));
}

/**
 * Quét 1 Google Sheet đã kết nối và nạp lead qua cửa ingestLead chung.
 * Đếm số dòng có SĐT / lead mới / dòng trùng, ghi lại vào channel_accounts.last_sync.
 * Dùng chung cho cron (quét tất cả) và "Đồng bộ ngay" (quét 1 sheet).
 */
export async function syncSheetChannel(
  service: Service,
  channel: { id: string; page_id: string; config: SheetConfig | null },
  getToken: (connectionId: string) => Promise<string>,
): Promise<SheetSyncResult> {
  const result: SheetSyncResult = { rows: 0, fresh: 0, dup: 0, skipped: 0, errors: [] };
  const cfg = (channel.config ?? {}) as SheetConfig;
  if (!cfg.connection_id) {
    result.errors.push('config-missing');
    await writeLastSync(service, channel.id, result);
    return result;
  }
  // Mỗi tab một cấu hình riêng (thương hiệu/showroom/cột/nguồn/dòng xe/mốc thời gian).
  const tabList = resolveTabConfigs(cfg);

  try {
    const accessToken = await getToken(cfg.connection_id);
    for (const tab of tabList) {
      // Cắt theo mốc thời gian chỉ bật khi tab có CẢ cột thời gian LẪN mốc since.
      const cutoffActive = tab.date_col != null && !!tab.since;
      const range = tab.title ? `${tab.title}!A1:Z10000` : 'A1:Z10000';
      const sheetRows = await readSheetValues({ accessToken, spreadsheetId: channel.page_id, range });
      for (const r of sheetRows.slice(1)) { // bỏ header
        if (tab.phone_col == null) continue; // tab chưa chọn cột SĐT → bỏ qua
        const phone = r[tab.phone_col] ?? '';
        if (!phone.replace(/\D/g, '')) continue;
        result.rows++;

        // Mốc thời gian: bỏ qua dòng có thời gian TRƯỚC mốc (lead cũ), hoặc ô thời gian
        // trống/không đọc được (an toàn — lead mới từ pipeline agency luôn có timestamp).
        if (cutoffActive && !isOnOrAfter(r[tab.date_col!], tab.since!)) {
          result.skipped++;
          continue;
        }

        const name = tab.name_col != null ? (r[tab.name_col] ?? null) : null;
        const notes = (tab.note_cols ?? []).map((c) => r[c]).filter(Boolean).join(' · ');

        // Nguồn: theo cột → ô tương ứng; theo tab → nhãn gán cho tab. Google Sheet chỉ là kênh
        // trung chuyển → mặc định nguồn data thật là 'facebook' (đa số sheet agency chạy FB Ads).
        const colSrc = tab.source_mode === 'column' && tab.source_col != null
          ? (r[tab.source_col] ?? '').trim().toLowerCase() : '';
        const source = tab.source_mode === 'column' ? (colSrc || 'facebook') : (tab.source || 'facebook');

        // Dòng xe: cố định → model_id; theo cột → đưa ô dòng xe vào intent_text; auto → name+notes.
        const modelCell = tab.model_mode === 'column' && tab.model_col != null ? (r[tab.model_col] ?? '') : '';
        const intentText = tab.model_mode === 'column' ? modelCell : [name, notes].filter(Boolean).join(' ');

        // Địa chỉ: đọc ô địa chỉ (nếu tab bật cột) → ingest định tuyến theo tỉnh.
        const addressText = tab.address_col != null ? (r[tab.address_col] ?? null) : null;

        const res = await ingestLead({
          page_id: channel.page_id,
          brand_id: tab.brand_id,
          showroom_ids: tab.showroom_ids,
          phone_raw: phone,
          full_name: name,
          source,
          model_id: tab.model_mode === 'fixed' ? (tab.model_id ?? null) : null,
          intent_text: intentText,
          address_text: addressText,
          address_fallback_province: tab.address_fallback_province,
          // Cách chia + tỷ lệ theo tab (giống fanpage) → CẤP 1 phân về showroom của tab.
          showroom_assign_strategy: tab.showroom_assign_strategy,
          showroom_shares: tab.showroom_shares,
          silent_dedup: true, // quét lại toàn bộ → đừng spam lead_logs khi trùng
          external_payload: { row: r, tab: tab.title || null },
        });
        if (res.ok) { if (res.deduped) result.dup++; else result.fresh++; }
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'unknown');
  }

  await writeLastSync(service, channel.id, result);
  return result;
}

async function writeLastSync(service: Service, channelId: string, r: SheetSyncResult) {
  await service.from('channel_accounts')
    .update({ last_sync: { at: new Date().toISOString(), rows: r.rows, fresh: r.fresh, dup: r.dup, skipped: r.skipped, errors: r.errors } })
    .eq('id', channelId);
}
