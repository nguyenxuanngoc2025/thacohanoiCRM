'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { STATUS_OPTIONS, type LeadStatus } from '@/lib/lead-status';
import { normalizePhone } from '@/lib/phone';
import { pickNextAssignee, pickByStrategy, type AssigneeLoad, type AssignStrategy, type StrategyCandidate } from '@/lib/assign';
import { matchTeamsForLead, teamInScope, type TeamRoute } from '@/lib/assign-routing';
import { CAN_CREATE_LEAD, CAN_ASSIGN, CAN_MANAGE_STAFF } from '@/lib/nav';
import { notifyNewLead, notifyLeadAssigned, notifyLeadsAssignedBulk } from '@/lib/notify-assign';
import { resolveCreatorScope, assertLeadInScope } from '@/lib/lead-scope';
import { type UserRole } from '@/types/database';

const VALID = new Set<LeadStatus>(STATUS_OPTIONS.map((s) => s.code));

type DB = Awaited<ReturnType<typeof createClient>>;

/**
 * Hạn liên hệ SLA vòng 1 tính TỪ BÂY GIỜ (mốc giao lead cho TVBH). Vì "quá hạn" chỉ tính
 * sau khi đã giao (chưa giao thì chưa đặt đồng hồ), mỗi lần giao lead cho TVBH ta đặt lại
 * next_contact_at = now + first_response_hours. Trả null nếu công ty chưa bật SLA vòng 1.
 */
async function slaFirstResponseAt(db: DB, companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const { data: sla } = await db
    .from('sla_config')
    .select('first_response_hours')
    .eq('company_id', companyId)
    .eq('round', 1)
    .eq('is_active', true)
    .maybeSingle();
  if (!sla) return null;
  return new Date(Date.now() + sla.first_response_hours * 3600 * 1000).toISOString();
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
  failReason?: string | null;
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

  // Fail → kèm lý do (mặc định 'Khác' nếu bỏ trống); phân loại khác → xoá lý do.
  const failReason = input.status === 'Fail' ? (input.failReason?.trim() || 'Khác') : null;

  const { data: updated, error } = await db
    .from('leads')
    .update({
      status: input.status,
      fail_reason: failReason,
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
    const suffix = input.status === 'Fail' && failReason ? ` (lý do: ${failReason})` : '';
    await db.from('lead_logs').insert({
      lead_id: input.leadId,
      user_id: user.id,
      type: 'status_change',
      old_status: prev.status,
      new_status: input.status,
      content: `Đổi phân loại sang ${input.status}${suffix}.`,
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

  const { data: prev } = await db.from('leads').select('assigned_to, status, company_id').eq('id', leadId).maybeSingle();
  if (prev?.assigned_to === newAssigneeId) return { ok: true as const };

  // Phòng của TVBH đích: dùng cho (a) phòng thủ phạm vi ngoài RLS, (b) đồng bộ sales_team_id
  // để khi quản lý giao lead sang TVBH ở PHÒNG KHÁC, lead cũng dời về đúng phòng đó.
  let targetTeamId: string | null = null;
  if (newAssigneeId) {
    const { data: target } = await db
      .from('users')
      .select('sales_team_id')
      .eq('id', newAssigneeId)
      .maybeSingle();
    targetTeamId = target?.sales_team_id ?? null;
    const scope = await resolveCreatorScope(db, user.id);
    if (scope && targetTeamId) {
      const { data: tm } = await db
        .from('sales_teams')
        .select('id, showroom_id, brand_ids')
        .eq('id', targetTeamId)
        .maybeSingle();
      if (tm && !teamInScope(scope, { id: tm.id, showroom_id: tm.showroom_id, brand_ids: (tm.brand_ids as string[] | null) ?? [] })) {
        return { ok: false as const, error: 'Tư vấn bán hàng ngoài phạm vi của bạn.' };
      }
    }
  }

  const patch: { assigned_to: string | null; sales_team_id?: string; next_contact_at?: string } =
    { assigned_to: newAssigneeId };
  if (targetTeamId) patch.sales_team_id = targetTeamId; // dời lead theo phòng của TVBH mới
  // Giao cho TVBH (không phải gỡ) + lead chưa phân loại → đặt lại đồng hồ SLA tính từ lúc giao.
  if (newAssigneeId && (prev?.status ?? null) === null) {
    const next = await slaFirstResponseAt(db, prev?.company_id ?? null);
    if (next) patch.next_contact_at = next;
  }
  const { error } = await db.from('leads').update(patch).eq('id', leadId);
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

  const { data: me } = await db.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (!me || !CAN_ASSIGN.has(me.role as UserRole)) return { ok: false as const, error: 'Bạn không có quyền phân giao.' };
  if (leadIds.length === 0) return { ok: true as const, updated: 0 };

  let newN = 'Chưa giao';
  if (newAssigneeId) {
    const { data: u } = await db.from('users').select('full_name').eq('id', newAssigneeId).maybeSingle();
    newN = u?.full_name ?? '—';
  }

  const { error } = await db.from('leads').update({ assigned_to: newAssigneeId }).in('id', leadIds);
  if (error) return { ok: false as const, error: error.message };

  // Giao cho TVBH → đặt lại đồng hồ SLA (chỉ lead chưa phân loại) tính từ lúc giao.
  if (newAssigneeId) {
    const next = await slaFirstResponseAt(db, me.company_id ?? null);
    if (next) await db.from('leads').update({ next_contact_at: next }).in('id', leadIds).is('status', null);
  }

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

  // Cô lập theo cấp: showroom/hãng/phòng gửi lên phải nằm trong phạm vi người tạo (không tin client).
  const scope = await resolveCreatorScope(db, user.id);
  if (!scope) return { ok: false as const, error: 'Không xác định được phạm vi tài khoản.' };
  const scopeErr = assertLeadInScope(scope, {
    showroomId: input.showroomId, brandId: input.brandId, salesTeamId: input.salesTeamId,
  });
  if (scopeErr) return { ok: false as const, error: scopeErr };

  // TVBH tạo lead: RLS yêu cầu assigned_to = chính họ. Để trống → tự gán bản thân.
  const assignedTo = input.assignedTo ?? (me.role === 'tvbh' ? user.id : null);

  // Phòng: ưu tiên phòng chỉ định; nếu trống nhưng có TVBH thì suy ra phòng của TVBH (giữ liên kết).
  // Cấp trưởng phòng (scope.teamId cố định) bỏ trống → dùng luôn phòng của họ.
  let salesTeamId = input.salesTeamId ?? scope.teamId;
  if (!salesTeamId && assignedTo) {
    const { data: tvbh } = await db.from('users').select('sales_team_id').eq('id', assignedTo).maybeSingle();
    salesTeamId = tvbh?.sales_team_id ?? null;
  }
  // Showroom: cấp trưởng phòng bỏ trống → suy từ showroom phòng (scope.showroomIds[0]); còn lại
  // (marketing showroom…) suy từ showroom của phòng đã chọn — cần cho RLS insert theo showroom.
  let showroomId = input.showroomId ?? (scope.teamId && scope.showroomIds?.length ? scope.showroomIds[0] : null);
  if (!showroomId && salesTeamId) {
    const { data: team } = await db.from('sales_teams').select('showroom_id').eq('id', salesTeamId).maybeSingle();
    showroomId = (team?.showroom_id as string | null) ?? null;
  }

  const note = input.note.trim();
  // Đã có TVBH ngay khi tạo → đặt đồng hồ SLA từ bây giờ; chưa giao thì chưa tính hạn.
  const nextContactAt = assignedTo ? await slaFirstResponseAt(db, me.company_id) : null;
  const { data: inserted, error } = await db
    .from('leads')
    .insert({
      company_id: me.company_id,
      brand_id: input.brandId,
      showroom_id: showroomId,
      sales_team_id: salesTeamId,
      model_id: input.modelId,
      assigned_to: assignedTo,
      phone,
      phone_raw: input.phone.trim(),
      full_name: input.fullName.trim() || null,
      source: input.source.trim() || 'Khác',
      status: null,
      round: 1,
      next_contact_at: nextContactAt,
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

  // Báo Zalo "LEAD MỚI" cho MỌI lead lên app (không chỉ khi có TVBH) — định tuyến theo phòng.
  // Chưa thuộc phòng nào (admin bỏ trống) → notifyNewLead tự bỏ qua (không có nhóm để báo).
  await notifyNewLead(inserted.id);

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
 * Tự động phân giao TẤT CẢ lead chưa có người phụ trách theo `strategy`:
 * mỗi lead → khớp phòng (theo showroom + hãng, hoặc sales_team_id sẵn có) → chọn 1 TVBH
 * trong phòng đó bằng pickByStrategy. Lead không khớp phòng nào có TVBH → bỏ qua (skipped).
 */
export async function autoDistributeLeads(
  strategy: AssignStrategy = 'least_loaded',
): Promise<AutoDistributeResult> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, assigned: 0, skipped: 0, error: 'Chưa đăng nhập.' };

  const { data: me } = await db.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (!me || !CAN_ASSIGN.has(me.role as UserRole)) return { ok: false, assigned: 0, skipped: 0, error: 'Bạn không có quyền phân giao.' };

  const scope = await resolveCreatorScope(db, user.id);
  const slaNext = await slaFirstResponseAt(db, me.company_id ?? null);

  // Phòng đang có (để khớp lead → phòng). Lọc phạm vi người xem.
  const { data: rawTeams } = await db
    .from('sales_teams')
    .select('id, showroom_id, brand_ids');
  const allTeams: TeamRoute[] = ((rawTeams ?? []) as { id: string; showroom_id: string | null; brand_ids: string[] | null }[])
    .map((t) => ({ id: t.id, showroom_id: t.showroom_id, brand_ids: t.brand_ids ?? [] }))
    .filter((t) => !scope || teamInScope(scope, t));
  const teamById = new Map(allTeams.map((t) => [t.id, t] as const));

  // TVBH đang hoạt động, gắn phòng. Nhóm theo phòng.
  const { data: tvbhs } = await db
    .from('users')
    .select('id, sales_team_id, assign_share_pct')
    .eq('role', 'tvbh')
    .eq('is_active', true)
    .not('sales_team_id', 'is', null);
  if (!tvbhs || tvbhs.length === 0) return { ok: false, assigned: 0, skipped: 0, error: 'Chưa có tư vấn bán hàng nào.' };
  const tvbhByTeam = new Map<string, { id: string; sharePct: number }[]>();
  for (const t of tvbhs as { id: string; sales_team_id: string; assign_share_pct: number | null }[]) {
    if (!teamById.has(t.sales_team_id)) continue;
    const arr = tvbhByTeam.get(t.sales_team_id) ?? [];
    arr.push({ id: t.id, sharePct: t.assign_share_pct ?? 0 });
    tvbhByTeam.set(t.sales_team_id, arr);
  }

  // Tải hiện tại + lần nhận gần nhất theo TVBH (cho weighted / round_robin).
  const { data: openLeads } = await db
    .from('leads')
    .select('assigned_to, created_at')
    .not('assigned_to', 'is', null)
    .or(OPEN_LEADS);
  const load: Record<string, number> = {};
  const lastAt: Record<string, number> = {};
  for (const r of (openLeads ?? []) as { assigned_to: string; created_at: string }[]) {
    load[r.assigned_to] = (load[r.assigned_to] ?? 0) + 1;
    const ms = new Date(r.created_at).getTime();
    if (!(r.assigned_to in lastAt) || ms > lastAt[r.assigned_to]) lastAt[r.assigned_to] = ms;
  }

  // Lead chưa giao (cũ trước → giao trước).
  const { data: unassigned } = await db
    .from('leads')
    .select('id, showroom_id, brand_id, sales_team_id, status')
    .is('assigned_to', null)
    .order('created_at', { ascending: true });
  if (!unassigned || unassigned.length === 0) return { ok: true, assigned: 0, skipped: 0 };

  let assigned = 0;
  let skipped = 0;
  const assignedPairs: { leadId: string; assigneeId: string }[] = [];
  for (const lead of unassigned as { id: string; showroom_id: string | null; brand_id: string | null; sales_team_id: string | null; status: string | null }[]) {
    // Phòng khớp lead → gộp TVBH của mọi phòng khớp làm ứng viên.
    const teams = matchTeamsForLead(lead, allTeams);
    const pool: StrategyCandidate[] = [];
    for (const tm of teams) {
      for (const p of tvbhByTeam.get(tm.id) ?? []) {
        pool.push({ id: p.id, activeLeadCount: load[p.id] ?? 0, sharePct: p.sharePct, lastAssignedAt: lastAt[p.id] ?? null });
      }
    }
    const pick = pickByStrategy(strategy === 'manual' || strategy === 'day_roster' ? 'least_loaded' : strategy, pool);
    if (!pick) { skipped += 1; continue; }
    // Giao lead → đặt lại đồng hồ SLA tính từ lúc giao (chỉ lead chưa phân loại).
    const patch: { assigned_to: string; next_contact_at?: string } = { assigned_to: pick };
    if (slaNext && (lead.status ?? null) === null) patch.next_contact_at = slaNext;
    const { error } = await db.from('leads').update(patch).eq('id', lead.id);
    if (error) { skipped += 1; continue; }
    load[pick] = (load[pick] ?? 0) + 1;
    lastAt[pick] = Date.now();
    assigned += 1;
    assignedPairs.push({ leadId: lead.id, assigneeId: pick });
    await db.from('lead_logs').insert({
      lead_id: lead.id,
      user_id: user.id,
      type: 'system',
      content: `Tự động phân giao (${STRATEGY_LABEL[strategy] ?? 'chia đều'}).`,
    });
  }

  if (assignedPairs.length > 0) await notifyLeadsAssignedBulk(assignedPairs);

  revalidatePath('/leads');
  revalidatePath('/assign');
  return { ok: true, assigned, skipped };
}

const STRATEGY_LABEL: Record<string, string> = {
  least_loaded: 'chia đều',
  weighted: 'chia theo tỷ lệ',
  round_robin: 'xoay vòng',
};

/**
 * Giao 1 lead cho CẢ PHÒNG: tự chọn 1 TVBH trong phòng theo team_assign_strategy của phòng.
 * Dùng khi người phân giao chọn thẳng phòng ở dropdown thay vì chỉ đích danh 1 TVBH.
 */
export async function assignLeadToTeamAuto(
  leadId: string,
  teamId: string,
): Promise<{ ok: boolean; assigneeId?: string; error?: string }> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, error: 'Chưa đăng nhập.' };
  const { data: me } = await db.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me || !CAN_ASSIGN.has(me.role as UserRole)) return { ok: false, error: 'Bạn không có quyền phân giao.' };

  const scope = await resolveCreatorScope(db, user.id);
  const { data: team } = await db
    .from('sales_teams')
    .select('id, showroom_id, brand_ids, tvbh_assign_strategy')
    .eq('id', teamId)
    .maybeSingle();
  if (!team) return { ok: false, error: 'Không tìm thấy phòng.' };
  const teamRoute: TeamRoute = { id: team.id, showroom_id: team.showroom_id, brand_ids: (team.brand_ids as string[] | null) ?? [] };
  if (scope && !teamInScope(scope, teamRoute)) return { ok: false, error: 'Phòng ngoài phạm vi của bạn.' };

  const { data: tvbhs } = await db
    .from('users')
    .select('id, assign_share_pct')
    .eq('role', 'tvbh')
    .eq('is_active', true)
    .eq('sales_team_id', teamId);
  if (!tvbhs || tvbhs.length === 0) return { ok: false, error: 'Phòng chưa có tư vấn bán hàng.' };

  const { data: openLeads } = await db
    .from('leads')
    .select('assigned_to, created_at')
    .in('assigned_to', tvbhs.map((t) => t.id))
    .or(OPEN_LEADS);
  const load: Record<string, number> = {};
  const lastAt: Record<string, number> = {};
  for (const r of (openLeads ?? []) as { assigned_to: string; created_at: string }[]) {
    load[r.assigned_to] = (load[r.assigned_to] ?? 0) + 1;
    const ms = new Date(r.created_at).getTime();
    if (!(r.assigned_to in lastAt) || ms > lastAt[r.assigned_to]) lastAt[r.assigned_to] = ms;
  }
  const strat = ((team.tvbh_assign_strategy as AssignStrategy | null) ?? 'least_loaded');
  const pool: StrategyCandidate[] = (tvbhs as { id: string; assign_share_pct: number | null }[]).map((t) => ({
    id: t.id, activeLeadCount: load[t.id] ?? 0, sharePct: t.assign_share_pct ?? 0, lastAssignedAt: lastAt[t.id] ?? null,
  }));
  const pick = pickByStrategy(strat === 'manual' || strat === 'day_roster' ? 'least_loaded' : strat, pool);
  if (!pick) return { ok: false, error: 'Không chọn được tư vấn bán hàng.' };

  return reassignLead(leadId, pick);
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
