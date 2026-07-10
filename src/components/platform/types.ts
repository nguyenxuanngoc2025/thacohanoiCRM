export interface PlatformBrand {
  id: string;
  name: string;
  slug: string;
}

export interface PlatformCompany {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  custom_domain: string | null;
  plan_status: string;
  max_showrooms: number;
  showroom_used: number;
  showroom_inactive: number;
  user_count: number;
  brand_ids: string[];
  b10_enabled: boolean;
}

export type ContractStatus = 'prospect' | 'active' | 'expired' | 'churned';

export interface ContractRow {
  id: string;
  company_id: string | null;
  company_name: string | null;
  prospect_name: string | null;
  plan_label: string | null;
  contract_value: number;
  currency: string;
  signed_at: string | null;
  term_months: number | null;
  expiry_date: string | null;
  status: ContractStatus;
  notes: string | null;
  paid: number;
  outstanding: number;
  overdue: boolean;
}

export interface ContractTotals {
  totalValue: number;
  totalPaid: number;
  totalOutstanding: number;
}

export interface PaymentRow {
  id: string;
  paid_at: string;
  amount: number;
  method: string | null;
  note: string | null;
}

export interface ScheduleRow {
  id: string;
  due_date: string;
  amount: number;
  note: string | null;
}

export interface CompanyOption {
  id: string;
  name: string;
}

export interface CompanyViewData {
  company: { id: string; name: string; subdomain: string | null; plan_status: string; max_showrooms: number };
  showrooms: { id: string; name: string; code: string | null; is_active: boolean; brand_ids: string[] }[];
  users: { id: string; full_name: string; email: string; role: string; is_active: boolean }[];
  leadTotal: number;
  statusCount: Record<string, number>;
  recentLeads: {
    id: string; full_name: string | null; phone: string; status: string;
    source: string | null; created_at: string; showroom_name: string | null;
  }[];
}
