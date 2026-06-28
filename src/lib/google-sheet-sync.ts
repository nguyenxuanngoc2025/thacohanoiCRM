import type { createServiceClient } from '@/lib/supabase/server';
import { readSheetValues } from '@/lib/google';
import { ingestLead } from '@/lib/ingest';
import { isOnOrAfter } from '@/lib/sheet-date';

type Service = ReturnType<typeof createServiceClient>;

export interface TabCfg { title: string; source?: string | null }

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
}

/** Kết quả 1 lần đồng bộ 1 sheet: rows=dòng có SĐT, fresh=lead mới, dup=trùng, skipped=trước mốc/không ngày. */
export interface SheetSyncResult { rows: number; fresh: number; dup: number; skipped: number; errors: string[] }

// Chuẩn hoá danh sách tab về dạng object (tương thích cấu hình cũ: mảng chuỗi / `tab` đơn).
export function normalizeTabs(cfg: SheetConfig): TabCfg[] {
  if (cfg.tabs && cfg.tabs.length > 0) {
    return cfg.tabs.map((t) => (typeof t === 'string' ? { title: t, source: null } : t));
  }
  if (cfg.tab) return [{ title: cfg.tab, source: null }];
  return [{ title: '', source: null }]; // tab mặc định
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
  if (!cfg.connection_id || cfg.phone_col == null) {
    result.errors.push('config-missing');
    await writeLastSync(service, channel.id, result);
    return result;
  }
  const tabList = normalizeTabs(cfg);
  const sourceMode = cfg.source_mode ?? 'fixed';
  const modelMode = cfg.model_mode ?? 'auto';
  // Cắt theo mốc thời gian chỉ bật khi có CẢ cột thời gian LẪN mốc since.
  const cutoffActive = cfg.date_col != null && !!cfg.since;

  try {
    const accessToken = await getToken(cfg.connection_id);
    for (const tab of tabList) {
      const range = tab.title ? `${tab.title}!A1:Z5000` : 'A1:Z5000';
      const sheetRows = await readSheetValues({ accessToken, spreadsheetId: channel.page_id, range });
      for (const r of sheetRows.slice(1)) { // bỏ header
        const phone = r[cfg.phone_col] ?? '';
        if (!phone.replace(/\D/g, '')) continue;
        result.rows++;

        // Mốc thời gian: bỏ qua dòng có thời gian TRƯỚC mốc (lead cũ), hoặc ô thời gian
        // trống/không đọc được (an toàn — lead mới từ pipeline agency luôn có timestamp).
        if (cutoffActive && !isOnOrAfter(r[cfg.date_col!], cfg.since!)) {
          result.skipped++;
          continue;
        }

        const name = cfg.name_col != null ? (r[cfg.name_col] ?? null) : null;
        const notes = (cfg.note_cols ?? []).map((c) => r[c]).filter(Boolean).join(' · ');

        // Nguồn: theo cột → ô tương ứng; theo tab → nhãn gán cho tab. Google Sheet chỉ là kênh
        // trung chuyển → mặc định nguồn data thật là 'facebook' (đa số sheet agency chạy FB Ads).
        const colSrc = sourceMode === 'column' && cfg.source_col != null ? (r[cfg.source_col] ?? '').trim().toLowerCase() : '';
        const source = sourceMode === 'column' ? (colSrc || 'facebook') : (tab.source || 'facebook');

        // Dòng xe: cố định → model_id; theo cột → đưa ô dòng xe vào intent_text; auto → name+notes.
        const modelCell = modelMode === 'column' && cfg.model_col != null ? (r[cfg.model_col] ?? '') : '';
        const intentText = modelMode === 'column' ? modelCell : [name, notes].filter(Boolean).join(' ');

        const res = await ingestLead({
          page_id: channel.page_id,
          phone_raw: phone,
          full_name: name,
          source,
          model_id: modelMode === 'fixed' ? (cfg.model_id ?? null) : null,
          intent_text: intentText,
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
