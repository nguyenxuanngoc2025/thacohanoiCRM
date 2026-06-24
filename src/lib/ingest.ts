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

  // 1 fanpage có thể phục vụ NHIỀU showroom (junction). Fallback: anchor showroom_id.
  const { data: junction } = await db
    .from('channel_account_showrooms')
    .select('showroom_id')
    .eq('channel_account_id', channel.id);

  const candidateShowroomIds =
    junction && junction.length > 0
      ? junction.map((j) => j.showroom_id)
      : channel.showroom_id
        ? [channel.showroom_id]
        : [];

  if (candidateShowroomIds.length === 0) return { ok: false, reason: 'no_showroom' };

  // Chống trùng theo (phone, brand_id) — brand cố định theo fanpage
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

  // TVBH active của tất cả showroom ứng viên (1 truy vấn)
  const { data: tvbhAll } = await db
    .from('users')
    .select('id, showroom_id')
    .in('showroom_id', candidateShowroomIds)
    .eq('role', 'tvbh')
    .eq('is_active', true);

  const tvbhByShowroom = new Map<string, string[]>();
  for (const t of tvbhAll ?? []) {
    const arr = tvbhByShowroom.get(t.showroom_id) ?? [];
    arr.push(t.id);
    tvbhByShowroom.set(t.showroom_id, arr);
  }

  // CẤP 1 — chia đều cho showroom: chọn showroom ít lead đang mở nhất.
  // Chỉ xét showroom có ≥1 TVBH active để lead có người nhận; nếu không có thì xét hết.
  const withTvbh = candidateShowroomIds.filter((id) => (tvbhByShowroom.get(id)?.length ?? 0) > 0);
  const showroomPool = withTvbh.length > 0 ? withTvbh : candidateShowroomIds;

  const showroomLoads: AssigneeLoad[] = [];
  for (const sid of showroomPool) {
    const { count } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('showroom_id', sid)
      .neq('status', 'Fail');
    showroomLoads.push({ id: sid, activeLeadCount: count ?? 0 });
  }
  const chosenShowroomId = pickNextAssignee(showroomLoads) ?? candidateShowroomIds[0];

  // Công ty của showroom đã chọn
  const { data: showroom } = await db
    .from('showrooms')
    .select('id, company_id')
    .eq('id', chosenShowroomId)
    .maybeSingle();

  if (!showroom) return { ok: false, reason: 'unknown_showroom' };

  // Luật phân giao: rule showroom (priority cao) ưu tiên hơn rule mặc định toàn công ty
  const { data: rules } = await db
    .from('assignment_rules')
    .select('showroom_id, strategy, specific_user_id, priority')
    .eq('company_id', showroom.company_id)
    .eq('is_active', true);

  const applicable = (rules ?? [])
    .filter((r) => r.showroom_id === chosenShowroomId || r.showroom_id === null)
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
    // CẤP 2 — least_loaded TVBH trong showroom đã chọn
    const tvbhIds = tvbhByShowroom.get(chosenShowroomId) ?? [];
    if (tvbhIds.length > 0) {
      const loads: AssigneeLoad[] = [];
      for (const id of tvbhIds) {
        const { count } = await db
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', id)
          .neq('status', 'Fail');
        loads.push({ id, activeLeadCount: count ?? 0 });
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
      showroom_id: chosenShowroomId,
      brand_id: channel.brand_id,
      channel_account_id: channel.id,
      assigned_to: assignedTo,
      phone,
      phone_raw: payload.phone_raw,
      full_name: payload.full_name ?? null,
      source: payload.source ?? 'facebook',
      status: null, // chưa phân loại — TVBH phân loại sau khi liên hệ
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
