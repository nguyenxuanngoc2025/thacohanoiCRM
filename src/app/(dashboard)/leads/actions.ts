'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { STATUS_OPTIONS, type LeadStatus } from '@/lib/lead-status';
import { normalizePhone } from '@/lib/phone';
import { pickNextAssignee, type AssigneeLoad } from '@/lib/assign';
import { CAN_CREATE_LEAD, CAN_ASSIGN, CAN_MANAGE_STAFF } from '@/lib/nav';
import { notifyLeadAssigned, notifyLeadsAssignedBulk } from '@/lib/notify-assign';
import { type UserRole } from '@/types/database';

const VALID = new Set<LeadStatus>(STATUS_OPTIONS.map((s) => s.code));

/** Đặt phân loại cho lead (null = bỏ phân loại). Đồng thời ghi log đổi trạng thái. */
export async function setLeadStatus(leadId: string, status: LeadStatus | null) {
  if (status !== null && !VALID.has(status)) return;
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
    content: status ? `Đổi phân loại sang ${status}.` : 'Bỏ phân loại.',
  });
  revalidatePath('/leads');
}

/**
 * Phân loại lead. Gán phân loại đồng thời TỰ đánh dấu đã liên hệ (vì đã phân loại
 * tức là đã làm việc với lead). status=null = bỏ phân loại (KHÔNG đụng last_contact_at).
 * Quy tắc bổ sung:
 *  - Fail: kèm lý do (fail_reason); status khác → xoá fail_reason.
 *  - 'Chưa LH được': mỗi lần chọn = 1 lần gọi hụt → tăng no_answer_count.
 * Ghi log liên hệ (nếu lần đầu) + log đổi phân loại.
 */
export async function classifyLead(leadId: string, status: LeadStatus | null, failReason?: string | null) {
  if (status !== null && !VALID.has(status)) return;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  const { data: prev } = await db.from('leads').select('status, last_contact_at, no_answer_count').eq('id', leadId).maybeSingle();
  const now = new Date().toISOString();
  const willMarkContacted = status !== null && !prev?.last_contact_at;

  const patch: {
    status: LeadStatus | null;
    last_contact_at?: string;
    fail_reason?: string | null;
    no_answer_count?: number;
  } = { status };
  if (willMarkContacted) patch.last_contact_at = now;
  patch.fail_reason = status === 'Fail' ? (failReason?.trim() || 'Khác') : null;
  if (status === 'Chưa LH được') patch.no_answer_count = (prev?.no_answer_count ?? 0) + 1;

  const { error } = await db.from('leads').update(patch).eq('id', leadId);
  if (error) return;

  if (willMarkContacted) {
    await db.from('lead_logs').insert({ lead_id: leadId, user_id: user.id, type: 'contact', content: 'Đánh dấu đã liên hệ.' });
  }
  if ((prev?.status ?? null) !== status) {
    const suffix = status === 'Fail' && patch.fail_reason ? ` (lý do: ${patch.fail_reason})` : '';
    await db.from('lead_logs').insert({
      lead_id: leadId, user_id: user.id, type: 'status_change',
      old_status: prev?.status ?? null, new_status: status,
      content: status ? `Đổi phân loại sang ${status}${suffix}.` : 'Bỏ phân loại.',
    });
  } else if (status === 'Chưa LH được') {
    await db.from('lead_logs').insert({
      lead_id: leadId, user_id: user.id, type: 'contact',
      content: `Gọi lần ${patch.no_answer_count} — chưa liên hệ được.`,
    });
  }
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

/**
 * Bỏ đánh dấu đã liên hệ — đưa lead về mặc định: last_contact_at = null VÀ
 * phân loại = null (chưa liên hệ thì không thể có phân loại).
 */
export async function unmarkContacted(leadId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;

  const { data: prev } = await db.from('leads').select('status').eq('id', leadId).maybeSingle();
  const { error } = await db.from('leads').update({ last_contact_at: null, status: null, fail_reason: null, no_answer_count: 0, overdue_reminder_count: 0 }).eq('id', leadId);
  if (error) return;

  await db.from('lead_logs').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'system',
    content: 'Đưa về trạng thái chưa liên hệ.',
  });
  if (prev?.status) {
    await db.from('lead_logs').insert({
      lead_id: leadId, user_id: user.id, type: 'status_change',
      old_status: prev.status, new_status: null, content: 'Bỏ phân loại.',
    });
  }
  revalidatePath('/leads');
}

export interface LeadUpdateInput {
  leadId: string;
  status: LeadStatus | null;
  modelId: string | null;
  note: string;
  nextContactAt: string | null;
}

/** Sửa tên khách hàng (độc lập — KHÔNG đánh dấu liên hệ). */
export async function renameLead(leadId: string, fullName: string | null) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  const name = fullName?.trim() || null;
  // .select() để biết số dòng thực đổi: nếu RLS chặn (ngoài phạm vi quyền) thì trả 0 dòng KHÔNG kèm lỗi
  // → phải báo thất bại thật, tránh "đã lưu" giả mà DB không đổi.
  // name_locked=true: user đã tự quyết tên → job tra Zalo tự động KHÔNG ghi đè nữa.
  const { data, error } = await db.from('leads')
    .update({ full_name: name, name_locked: true })
    .eq('id', leadId).select('id');
  if (error) return { ok: false as const, error: error.message };
  if (!data || data.length === 0) return { ok: false as const, error: 'Bạn không có quyền sửa lead này.' };

  await db.from('lead_logs').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'system',
    content: name ? `Sửa tên khách hàng: ${name}.` : 'Xoá tên khách hàng.',
  });

  revalidatePath('/leads');
  return { ok: true as const };
}

/**
 * Cập nhật lead khi TVBH liên hệ: đặt phân loại + dòng xe + ghi chú liên hệ +
 * hẹn gọi lại, đồng thời đánh dấu đã liên hệ (last_contact_at = now) và ghi log.
 */
export async function updateLead(input: LeadUpdateInput) {
  if (input.status !== null && !VALID.has(input.status)) return { ok: false as const, error: 'Phân loại không hợp lệ.' };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  const note = input.note.trim();
  const now = new Date().toISOString();

  const { data: prev } = await db.from('leads').select('status').eq('id', input.leadId).maybeSingle();

  const { data: updated, error } = await db
    .from('leads')
    .update({
      status: input.status,
      model_id: input.modelId,
      last_note: note || null,
      last_contact_at: now,
      next_contact_at: input.nextContactAt,
    })
    .eq('id', input.leadId)
    .select('id');
  if (error) return { ok: false as const, error: error.message };
  // 0 dòng đổi mà không lỗi = RLS chặn (ngoài phạm vi quyền) → báo thất bại thật.
  if (!updated || updated.length === 0) return { ok: false as const, error: 'Bạn không có quyền sửa lead này.' };

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

/**
 * Đổi dòng xe của lead (sửa nhanh ngay trong bảng). null = bỏ dòng xe.
 * CHỈ ghi cột model_id — KHÔNG đụng trạng thái/đánh dấu liên hệ. Ghi log 'system'.
 */
export async function setLeadModel(leadId: string, modelId: string | null) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  const { data: prev } = await db.from('leads').select('model_id').eq('id', leadId).maybeSingle();
  if ((prev?.model_id ?? null) === modelId) return { ok: true as const };

  const { error } = await db.from('leads').update({ model_id: modelId }).eq('id', leadId);
  if (error) return { ok: false as const, error: error.message };

  // Tên dòng xe để ghi log dễ đọc
  let newName = 'Bỏ dòng xe';
  if (modelId) {
    const { data: m } = await db.from('models').select('name').eq('id', modelId).maybeSingle();
    newName = m?.name ?? '—';
  }
  await db.from('lead_logs').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'system',
    content: `Cập nhật dòng xe: ${newName}.`,
  });

  revalidatePath('/leads');
  revalidatePath('/assign');
  return { ok: true as const };
}

/**
 * Đổi người phụ trách (chỉ admin/manager). TVBH không có quyền.
 * Ghi log 'system' để truy vết ai đổi, từ ai sang ai.
 */
export async function reassignLead(leadId: string, newAssigneeId: string | null) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  const { data: me } = await db.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me || !CAN_ASSIGN.has(me.role as UserRole)) return { ok: false as const, error: 'Bạn không có quyền đổi người phụ trách.' };

  const { data: prev } = await db.from('leads').select('assigned_to').eq('id', leadId).maybeSingle();
  if (prev?.assigned_to === newAssigneeId) return { ok: true as const };

  const { error } = await db.from('leads').update({ assigned_to: newAssigneeId }).eq('id', leadId);
  if (error) return { ok: false as const, error: error.message };

  // Lấy tên cũ + mới để ghi log
  const ids = [prev?.assigned_to, newAssigneeId].filter((x): x is string => !!x);
  let names: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: us } = await db.from('users').select('id, full_name').in('id', ids);
    names = Object.fromEntries((us ?? []).map((u) => [u.id, u.full_name]));
  }
  const oldN = prev?.assigned_to ? (names[prev.assigned_to] ?? '—') : 'Chưa giao';
  const newN = newAssigneeId ? (names[newAssigneeId] ?? '—') : 'Chưa giao';

  await db.from('lead_logs').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'system',
    content: `Đổi người phụ trách: ${oldN} → ${newN}.`,
  });

  // Báo Zalo nhóm phòng khi giao cho 1 TVBH (kể cả đổi A→B). Gỡ phụ trách (null) thì không báo.
  if (newAssigneeId) await notifyLeadAssigned(leadId, newAssigneeId);

  revalidatePath('/leads');
  revalidatePath('/assign');
  return { ok: true as const };
}

/**
 * Đổi phòng bán hàng (sales_team) của lead — cho người có quyền phân giao.
 * Khi đổi phòng, nếu người phụ trách hiện tại KHÔNG thuộc phòng mới thì gỡ phụ trách
 * để trưởng phòng mới tự phân lại cho TVBH. Ghi log 'system'.
 */
export async function reassignTeam(leadId: string, newTeamId: string | null) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  const { data: me } = await db.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me || !CAN_ASSIGN.has(me.role as UserRole)) return { ok: false as const, error: 'Bạn không có quyền đổi phòng bán hàng.' };

  const { data: prev } = await db.from('leads').select('sales_team_id, assigned_to').eq('id', leadId).maybeSingle();
  if (!prev) return { ok: false as const, error: 'Không tìm thấy lead.' };
  if (prev.sales_team_id === newTeamId) return { ok: true as const, clearedAssignee: false };

  // Nếu người phụ trách hiện tại không thuộc phòng mới → gỡ phụ trách (TP phòng mới tự phân lại).
  let clearAssignee = false;
  if (prev.assigned_to) {
    if (!newTeamId) {
      clearAssignee = true;
    } else {
      const { data: a } = await db.from('users').select('sales_team_id').eq('id', prev.assigned_to).maybeSingle();
      if (a?.sales_team_id !== newTeamId) clearAssignee = true;
    }
  }

  const patch: { sales_team_id: string | null; assigned_to?: string | null } = { sales_team_id: newTeamId };
  if (clearAssignee) patch.assigned_to = null;

  const { data: updated, error } = await db.from('leads').update(patch).eq('id', leadId).select('id');
  if (error) return { ok: false as const, error: error.message };
  // 0 dòng đổi mà không lỗi = RLS chặn (ngoài phạm vi quyền) → báo thất bại thật.
  if (!updated || updated.length === 0) return { ok: false as const, error: 'Bạn không có quyền sửa lead này.' };

  // Tên phòng cũ + mới để ghi log dễ đọc
  const ids = [prev.sales_team_id, newTeamId].filter((x): x is string => !!x);
  let names: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: ts } = await db.from('sales_teams').select('id, name').in('id', ids);
    names = Object.fromEntries((ts ?? []).map((t) => [t.id, t.name]));
  }
  const oldN = prev.sales_team_id ? (names[prev.sales_team_id] ?? '—') : 'Chưa phân phòng';
  const newN = newTeamId ? (names[newTeamId] ?? '—') : 'Chưa phân phòng';

  await db.from('lead_logs').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'system',
    content: clearAssignee
      ? `Đổi phòng bán hàng: ${oldN} → ${newN} (gỡ phụ trách để phòng mới phân lại).`
      : `Đổi phòng bán hàng: ${oldN} → ${newN}.`,
  });

  revalidatePath('/leads');
  revalidatePath('/assign');
  return { ok: true as const, clearedAssignee: clearAssignee };
}

/**
 * Gán hàng loạt nhiều lead cho 1 TVBH (chỉ admin/manager). Bỏ qua lead đã đúng người.
 * Ghi log 'system' cho từng lead.
 */
export async function bulkReassign(leadIds: string[], newAssigneeId: string | null) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  const { data: me } = await db.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me || !CAN_ASSIGN.has(me.role as UserRole)) return { ok: false as const, error: 'Bạn không có quyền phân giao.' };
  if (leadIds.length === 0) return { ok: true as const, updated: 0 };

  let newN = 'Chưa giao';
  if (newAssigneeId) {
    const { data: u } = await db.from('users').select('full_name').eq('id', newAssigneeId).maybeSingle();
    newN = u?.full_name ?? '—';
  }

  const { error } = await db.from('leads').update({ assigned_to: newAssigneeId }).in('id', leadIds);
  if (error) return { ok: false as const, error: error.message };

  await db.from('lead_logs').insert(
    leadIds.map((id) => ({
      lead_id: id, user_id: user.id, type: 'system',
      content: `Gán hàng loạt → ${newN}.`,
    }))
  );

  // Báo Zalo: 1 tin tóm tắt/phòng (chống dội nhóm). Gỡ phụ trách (null) thì không báo.
  if (newAssigneeId) {
    await notifyLeadsAssignedBulk(leadIds.map((id) => ({ leadId: id, assigneeId: newAssigneeId })));
  }

  revalidatePath('/leads');
  revalidatePath('/assign');
  return { ok: true as const, updated: leadIds.length };
}

/**
 * Xoá hàng loạt lead — CHỈ admin. lead_logs/lead_notes tự dọn theo ON DELETE CASCADE.
 * Kiểm tra role ở action (lớp 1) + RLS policy leads_delete admin-only (lớp 2).
 */
export async function deleteLeads(leadIds: string[]) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  const { data: me } = await db.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me || !CAN_MANAGE_STAFF.has(me.role as UserRole)) return { ok: false as const, error: 'Chỉ quản trị viên được xoá lead.' };
  if (leadIds.length === 0) return { ok: true as const, deleted: 0 };

  const { data: deleted, error } = await db.from('leads').delete().in('id', leadIds).select('id');
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/leads');
  revalidatePath('/assign');
  return { ok: true as const, deleted: deleted?.length ?? 0 };
}

export interface NewLeadInput {
  fullName: string;
  phone: string;
  brandId: string;
  showroomId: string | null;
  salesTeamId: string | null;
  modelId: string | null;
  source: string;
  assignedTo: string | null;
  note: string;
}

/** Tạo lead thủ công (nhập tay). Lead mới: chưa liên hệ, chưa phân loại. */
export async function createLead(input: NewLeadInput) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: 'Chưa đăng nhập.' };

  if (!input.brandId) return { ok: false as const, error: 'Chọn thương hiệu.' };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false as const, error: 'Số điện thoại không hợp lệ.' };

  const { data: me } = await db.from('users').select('company_id, role').eq('id', user.id).maybeSingle();
  if (!me?.company_id) return { ok: false as const, error: 'Tài khoản chưa gắn công ty.' };
  if (!CAN_CREATE_LEAD.has(me.role as UserRole)) return { ok: false as const, error: 'Bạn không có quyền thêm lead.' };

  // Phòng: ưu tiên phòng chỉ định; nếu trống nhưng có TVBH thì suy ra phòng của TVBH (giữ liên kết).
  let salesTeamId = input.salesTeamId;
  if (!salesTeamId && input.assignedTo) {
    const { data: tvbh } = await db.from('users').select('sales_team_id').eq('id', input.assignedTo).maybeSingle();
    salesTeamId = tvbh?.sales_team_id ?? null;
  }

  const note = input.note.trim();
  const { data: inserted, error } = await db
    .from('leads')
    .insert({
      company_id: me.company_id,
      brand_id: input.brandId,
      showroom_id: input.showroomId,
      sales_team_id: salesTeamId,
      model_id: input.modelId,
      assigned_to: input.assignedTo,
      phone,
      phone_raw: input.phone.trim(),
      full_name: input.fullName.trim() || null,
      source: input.source.trim() || 'Khác',
      status: null,
      round: 1,
      last_note: note || null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false as const, error: 'Lead đã tồn tại (trùng SĐT cho thương hiệu này).' };
    return { ok: false as const, error: error.message };
  }

  await db.from('lead_logs').insert({
    lead_id: inserted.id,
    user_id: user.id,
    type: 'system',
    content: 'Tạo lead thủ công.',
  });

  // Báo Zalo nhóm phòng khi tạo lead đã có TVBH (nhắc vào chăm sóc). Không TVBH thì không báo.
  if (input.assignedTo) await notifyLeadAssigned(inserted.id, input.assignedTo);

  revalidatePath('/leads');
  return { ok: true as const, id: inserted.id };
}

export interface AssignmentRecommendation {
  showroomId: string | null;
  showroomName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
}

/** Số lead đang mở (chưa Fail, kể cả chưa phân loại = NULL). */
const OPEN_LEADS = 'status.is.null,status.neq.Fail';

/**
 * Gợi ý phân giao cho lead mới (thuật toán xoay vòng đều / least-loaded):
 * - Showroom: showroom ít lead đang mở nhất trong công ty (dùng khi chưa chọn showroom).
 * - Phụ trách: TVBH ít lead đang mở nhất trong showroom đó.
 * Chỉ là GỢI Ý — người dùng vẫn chọn lại được.
 */
export async function recommendAssignment(showroomId: string | null): Promise<AssignmentRecommendation> {
  const empty: AssignmentRecommendation = { showroomId: null, showroomName: null, assigneeId: null, assigneeName: null };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return empty;

  const { data: me } = await db.from('users').select('company_id').eq('id', user.id).maybeSingle();
  if (!me?.company_id) return empty;

  // Mọi TVBH đang hoạt động + có gắn showroom (chỉ TVBH mới nhận lead)
  const { data: tvbhs } = await db
    .from('users')
    .select('id, full_name, showroom_id')
    .eq('company_id', me.company_id)
    .eq('role', 'tvbh')
    .eq('is_active', true)
    .not('showroom_id', 'is', null);

  if (!tvbhs || tvbhs.length === 0) return empty;

  // Showroom mục tiêu: do người dùng chọn, hoặc showroom (có TVBH) ít lead đang mở nhất
  let recShowroomId = showroomId;
  if (!recShowroomId) {
    const showroomIds = [...new Set(tvbhs.map((t) => t.showroom_id as string))];
    const counts: { id: string; n: number }[] = [];
    for (const sid of showroomIds) {
      const { count } = await db
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('showroom_id', sid)
        .or(OPEN_LEADS);
      counts.push({ id: sid, n: count ?? 0 });
    }
    counts.sort((a, b) => (a.n !== b.n ? a.n - b.n : a.id.localeCompare(b.id)));
    recShowroomId = counts[0]?.id ?? null;
  }

  let recShowroomName: string | null = null;
  if (recShowroomId) {
    const { data: sr } = await db.from('showrooms').select('name').eq('id', recShowroomId).maybeSingle();
    recShowroomName = sr?.name ?? null;
  }

  // Gợi ý phụ trách: TVBH ít lead đang mở nhất trong showroom mục tiêu (xoay vòng đều)
  const inShowroom = tvbhs.filter((t) => t.showroom_id === recShowroomId);
  let assigneeId: string | null = null;
  let assigneeName: string | null = null;
  if (inShowroom.length > 0) {
    const loads: AssigneeLoad[] = [];
    for (const t of inShowroom) {
      const { count } = await db
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', t.id)
        .or(OPEN_LEADS);
      loads.push({ id: t.id, activeLeadCount: count ?? 0 });
    }
    assigneeId = pickNextAssignee(loads);
    assigneeName = inShowroom.find((t) => t.id === assigneeId)?.full_name ?? null;
  }

  return { showroomId: recShowroomId, showroomName: recShowroomName, assigneeId, assigneeName };
}

export interface AutoDistributeResult {
  ok: boolean;
  assigned: number;
  skipped: number;
  error?: string;
}

/**
 * Tự động phân giao đều TẤT CẢ lead chưa có người phụ trách (assigned_to IS NULL):
 * mỗi lead → TVBH ít lead đang mở nhất TRONG CÙNG showroom của lead (xoay vòng đều).
 * Lead không khớp showroom nào có TVBH thì bỏ qua (skipped). Chỉ admin/manager.
 */
export async function autoDistributeLeads(): Promise<AutoDistributeResult> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, assigned: 0, skipped: 0, error: 'Chưa đăng nhập.' };

  const { data: me } = await db.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me || !CAN_ASSIGN.has(me.role as UserRole)) return { ok: false, assigned: 0, skipped: 0, error: 'Bạn không có quyền phân giao.' };

  // TVBH đang hoạt động + có gắn showroom (chỉ TVBH mới nhận lead)
  const { data: tvbhs } = await db
    .from('users')
    .select('id, showroom_id')
    .eq('role', 'tvbh')
    .eq('is_active', true)
    .not('showroom_id', 'is', null);
  if (!tvbhs || tvbhs.length === 0) return { ok: false, assigned: 0, skipped: 0, error: 'Chưa có tư vấn bán hàng nào.' };

  // Tải hiện tại: số lead đang mở của mỗi TVBH
  const { data: openLeads } = await db
    .from('leads')
    .select('assigned_to')
    .not('assigned_to', 'is', null)
    .or(OPEN_LEADS);
  const load: Record<string, number> = {};
  for (const t of tvbhs) load[t.id] = 0;
  for (const r of (openLeads ?? []) as { assigned_to: string }[]) {
    if (r.assigned_to in load) load[r.assigned_to] += 1;
  }

  // Lead chưa giao (cũ trước → giao trước)
  const { data: unassigned } = await db
    .from('leads')
    .select('id, showroom_id')
    .is('assigned_to', null)
    .order('created_at', { ascending: true });
  if (!unassigned || unassigned.length === 0) return { ok: true, assigned: 0, skipped: 0 };

  let assigned = 0;
  let skipped = 0;
  const assignedPairs: { leadId: string; assigneeId: string }[] = [];
  for (const lead of unassigned as { id: string; showroom_id: string | null }[]) {
    const candidates = tvbhs.filter((t) => (lead.showroom_id ? t.showroom_id === lead.showroom_id : true));
    const pick = pickNextAssignee(candidates.map((c) => ({ id: c.id, activeLeadCount: load[c.id] ?? 0 })));
    if (!pick) { skipped += 1; continue; }
    const { error } = await db.from('leads').update({ assigned_to: pick }).eq('id', lead.id);
    if (error) { skipped += 1; continue; }
    load[pick] = (load[pick] ?? 0) + 1;
    assigned += 1;
    assignedPairs.push({ leadId: lead.id, assigneeId: pick });
    await db.from('lead_logs').insert({
      lead_id: lead.id,
      user_id: user.id,
      type: 'system',
      content: 'Tự động phân giao (chia đều).',
    });
  }

  // Báo Zalo: 1 tin tóm tắt/phòng cho các lead vừa chia.
  if (assignedPairs.length > 0) await notifyLeadsAssignedBulk(assignedPairs);

  revalidatePath('/leads');
  revalidatePath('/assign');
  return { ok: true, assigned, skipped };
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
