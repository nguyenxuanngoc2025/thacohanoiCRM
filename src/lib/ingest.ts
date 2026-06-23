import { createServiceClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/phone';
import { pickNextAssignee, type AssigneeLoad } from '@/lib/assign';
import type { IngestPayload, IngestResult } from '@/types/database';

/** Cửa nạp lead chung — mọi kênh (FB webhook, n8n sau này) gọi vào đây. */
export async function ingestLead(payload: IngestPayload): Promise<IngestResult> {
  const db = createServiceClient();

  const phone = normalizePhone(payload.phone_raw);
  if (!phone) return { ok: false, reason: 'invalid_phone' };

  // Tra nguồn theo page_id
  const { data: channel } = await db
    .from('channel_accounts')
    .select('id, showroom_id, brand_id, campaign')
    .eq('page_id', payload.page_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!channel) return { ok: false, reason: 'unknown_channel' };

  const { data: showroom } = await db
    .from('showrooms')
    .select('id, company_id')
    .eq('id', channel.showroom_id)
    .maybeSingle();

  if (!showroom) return { ok: false, reason: 'unknown_showroom' };

  // Chống trùng theo (phone, brand_id)
  const { data: existing } = await db
    .from('leads')
    .select('id, assigned_to')
    .eq('phone', phone)
    .eq('brand_id', channel.brand_id)
    .maybeSingle();

  if (existing) {
    await db.from('lead_logs').insert({
      lead_id: existing.id,
      type: 'system',
      content: `Lead trùng SĐT từ kênh ${payload.source ?? 'facebook'} — giữ nguyên TVBH đang chăm.`,
    });
    return { ok: true, leadId: existing.id, deduped: true };
  }

  // Phân giao: TVBH active trong showroom + đếm lead đang mở
  const { data: tvbhs } = await db
    .from('users')
    .select('id')
    .eq('showroom_id', channel.showroom_id)
    .eq('role', 'tvbh')
    .eq('is_active', true);

  let assignedTo: string | null = null;
  if (tvbhs && tvbhs.length > 0) {
    const loads: AssigneeLoad[] = [];
    for (const t of tvbhs) {
      const { count } = await db
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', t.id)
        .neq('status', 'Fail');
      loads.push({ id: t.id, activeLeadCount: count ?? 0 });
    }
    assignedTo = pickNextAssignee(loads);
  }

  const { data: inserted, error } = await db
    .from('leads')
    .insert({
      company_id: showroom.company_id,
      showroom_id: channel.showroom_id,
      brand_id: channel.brand_id,
      channel_account_id: channel.id,
      assigned_to: assignedTo,
      phone,
      phone_raw: payload.phone_raw,
      full_name: payload.full_name ?? null,
      source: payload.source ?? 'facebook',
      status: 'KHQT',
      round: 1,
      fb_lead_id: payload.fb_lead_id ?? null,
      external_payload: payload.external_payload ?? null,
    })
    .select('id')
    .single();

  if (error || !inserted) return { ok: false, reason: error?.message ?? 'insert_failed' };

  await db.from('notifications').insert({
    lead_id: inserted.id,
    channel: 'zalo',
    status: 'pending',
    payload: { event: 'new_lead', leadId: inserted.id, phone },
  });

  return { ok: true, leadId: inserted.id, deduped: false };
}
