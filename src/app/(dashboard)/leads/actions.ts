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

export interface LeadUpdateInput {
  leadId: string;
  status: LeadStatus;
  modelId: string | null;
  note: string;
  nextContactAt: string | null;
}

/**
 * Cập nhật lead khi TVBH liên hệ: đặt phân loại + dòng xe + ghi chú liên hệ +
 * hẹn gọi lại, đồng thời đánh dấu đã liên hệ (last_contact_at = now) và ghi log.
 */
export async function updateLead(input: LeadUpdateInput) {
  if (!VALID.has(input.status)) return { ok: false as const, error: 'Phân loại không hợp lệ.' };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  const note = input.note.trim();
  const now = new Date().toISOString();

  const { data: prev } = await db.from('leads').select('status').eq('id', input.leadId).maybeSingle();

  const { error } = await db
    .from('leads')
    .update({
      status: input.status,
      model_id: input.modelId,
      last_note: note || null,
      last_contact_at: now,
      next_contact_at: input.nextContactAt,
    })
    .eq('id', input.leadId);
  if (error) return { ok: false as const, error: error.message };

  // Log liên hệ (luôn ghi vì đây là 1 lần TVBH liên hệ KH)
  await db.from('lead_logs').insert({
    lead_id: input.leadId,
    user_id: user.id,
    type: 'contact',
    content: note || 'Cập nhật liên hệ.',
    created_at: now,
  });

  // Log đổi phân loại nếu khác
  if (prev?.status && prev.status !== input.status) {
    await db.from('lead_logs').insert({
      lead_id: input.leadId,
      user_id: user.id,
      type: 'status_change',
      old_status: prev.status,
      new_status: input.status,
      content: `Đổi phân loại sang ${input.status}.`,
    });
  }

  revalidatePath('/leads');
  return { ok: true as const };
}

export interface LeadLogItem {
  id: string;
  type: string;
  content: string | null;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
  user_name: string | null;
}

/** Lấy lịch sử log của 1 lead (mới nhất trước) cho timeline trong drawer. */
export async function getLeadLogs(leadId: string): Promise<LeadLogItem[]> {
  const db = await createClient();
  const { data } = await db
    .from('lead_logs')
    .select('id, type, content, old_status, new_status, created_at, actor:users!user_id(full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(50);

  return ((data ?? []) as unknown as {
    id: string; type: string; content: string | null;
    old_status: string | null; new_status: string | null;
    created_at: string; actor: { full_name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    type: r.type,
    content: r.content,
    old_status: r.old_status,
    new_status: r.new_status,
    created_at: r.created_at,
    user_name: r.actor?.full_name ?? null,
  }));
}
