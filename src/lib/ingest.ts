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

  // Luật phân giao: rule showroom (priority cao) ưu tiên hơn rule mặc định toàn công ty
  const { data: rules } = await db
    .from('assignment_rules')
    .select('showroom_id, strategy, specific_user_id, priority')
    .eq('company_id', showroom.company_id)
    .eq('is_active', true);

  const applicable = (rules ?? [])
    .filter((r) => r.showroom_id === channel.showroom_id || r.showroom_id === null)
    .sort((a, b) => {
      // ưu tiên: số priority cao trước; cùng priority thì rule showroom trước rule mặc định
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (b.showroom_id ? 1 : 0) - (a.showroom_id ? 1 : 0);
    });
  const rule = applicable[0];

  let assignedTo: string | null = null;
  if (rule?.strategy === 'specific_user' && rule.specific_user_id) {
    assignedTo = rule.specific_user_id;
  } else {
    // least_loaded (mặc định): TVBH active trong showroom + đếm lead đang mở
    const { data: tvbhs } = await db
      .from('users')
      .select('id')
      .eq('showroom_id', channel.showroom_id)
      .eq('role', 'tvbh')
      .eq('is_active', true);

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
  }

  // SLA vòng 1: hạn liên hệ lần đầu → next_contact_at
  const { data: sla } = await db
    .from('sla_config')
    .select('first_response_hours')
    .eq('company_id', showroom.company_id)
    .eq('round', 1)
    .eq('is_active', true)
    .maybeSingle();
  const nextContactAt = sla
    ? new Date(Date.now() + sla.first_response_hours * 3600 * 1000).toISOString()
    : null;

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
      next_contact_at: nextContactAt,
      fb_lead_id: payload.fb_lead_id ?? null,
      external_payload: payload.external_payload ?? null,
    })
    .select('id')
    .single();

  if (error || !inserted) return { ok: false, reason: error?.message ?? 'insert_failed' };

  // Đẩy thông báo vào mọi kênh đang bật có sự kiện 'new_lead'
  const { data: notifChannels } = await db
    .from('notification_channels')
    .select('channel, target, events')
    .eq('company_id', showroom.company_id)
    .eq('is_active', true);

  const targets = (notifChannels ?? []).filter((c) => (c.events ?? []).includes('new_lead'));
  if (targets.length > 0) {
    await db.from('notifications').insert(
      targets.map((c) => ({
        lead_id: inserted.id,
        channel: c.channel,
        status: 'pending',
        payload: { event: 'new_lead', leadId: inserted.id, phone, target: c.target },
      }))
    );
  }

  return { ok: true, leadId: inserted.id, deduped: false };
}
