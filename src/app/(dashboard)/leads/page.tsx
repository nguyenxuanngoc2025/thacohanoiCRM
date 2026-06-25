import { createClient } from '@/lib/supabase/server';
import { type LeadRow } from './LeadsTable';
import LeadsView, { type ModelOption, type BrandOption, type ShowroomOption, type AssigneeOption } from './LeadsView';
import { CAN_CREATE_LEAD, CAN_ASSIGN, CAN_MANAGE_STAFF } from '@/lib/nav';
import { type UserRole } from '@/types/database';

export const dynamic = 'force-dynamic';

interface RawLead {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  status: LeadRow['status'];
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  last_note: string | null;
  fail_reason: string | null;
  no_answer_count: number | null;
  brand_id: string;
  model_id: string | null;
  showroom_id: string | null;
  assigned_to: string | null;
  brand: { name: string } | null;
  model: { name: string } | null;
  showroom: { name: string } | null;
  assignee: { full_name: string } | null;
}

export default async function LeadsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const canCreate = me?.role ? CAN_CREATE_LEAD.has(me.role as UserRole) : false;
  const canAssign = me?.role ? CAN_ASSIGN.has(me.role as UserRole) : false;
  const canDelete = me?.role ? CAN_MANAGE_STAFF.has(me.role as UserRole) : false;

  const [
    { data: rawLeads },
    { data: rawModels },
    { data: contactLogs },
    { data: rawBrands },
    { data: rawShowrooms },
    { data: rawAssignees },
  ] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, full_name, phone, source, status, created_at, last_contact_at, next_contact_at, last_note, fail_reason, no_answer_count, brand_id, model_id, showroom_id, assigned_to, brand:brands(name), model:models(name), showroom:showrooms(name), assignee:users!assigned_to(full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('models').select('id, name, brand_id').eq('is_active', true).order('sort_order'),
    supabase.from('lead_logs').select('lead_id').eq('type', 'contact'),
    supabase.from('brands').select('id, name').order('name'),
    supabase.from('showrooms').select('id, name').order('name'),
    supabase.from('users').select('id, full_name').eq('role', 'tvbh').eq('is_active', true).order('full_name'),
  ]);

  // Đếm số lần liên hệ theo lead
  const contactCount: Record<string, number> = {};
  for (const r of (contactLogs ?? []) as { lead_id: string }[]) {
    contactCount[r.lead_id] = (contactCount[r.lead_id] ?? 0) + 1;
  }

  const leads: LeadRow[] = ((rawLeads ?? []) as unknown as RawLead[]).map((l) => ({
    id: l.id,
    full_name: l.full_name,
    phone: l.phone,
    source: l.source,
    status: l.status,
    created_at: l.created_at,
    last_contact_at: l.last_contact_at,
    next_contact_at: l.next_contact_at,
    last_note: l.last_note,
    fail_reason: l.fail_reason,
    no_answer_count: l.no_answer_count ?? 0,
    brand_id: l.brand_id,
    brand_name: l.brand?.name ?? '—',
    model_id: l.model_id,
    model_name: l.model?.name ?? null,
    showroom_id: l.showroom_id,
    showroom_name: l.showroom?.name ?? null,
    assigned_to: l.assigned_to,
    assignee_name: l.assignee?.full_name ?? null,
    contact_count: contactCount[l.id] ?? 0,
  }));

  const models: ModelOption[] = ((rawModels ?? []) as ModelOption[]);
  const brands: BrandOption[] = ((rawBrands ?? []) as BrandOption[]);
  const showrooms: ShowroomOption[] = ((rawShowrooms ?? []) as ShowroomOption[]);
  const assignees: AssigneeOption[] = ((rawAssignees ?? []) as AssigneeOption[]);

  return (
    <LeadsView
      leads={leads}
      models={models}
      brands={brands}
      showrooms={showrooms}
      assignees={assignees}
      canCreate={canCreate}
      canAssign={canAssign}
      canDelete={canDelete}
    />
  );
}
