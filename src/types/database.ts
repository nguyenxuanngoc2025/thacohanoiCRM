export type UserRole = 'admin' | 'manager' | 'tvbh';
export type LeadStatus = 'KHQT' | 'GDTD' | 'KHĐ' | 'Chưa LH được' | 'Fail';

export interface IngestPayload {
  page_id: string;
  phone_raw: string | null;
  full_name?: string | null;
  source?: string | null;
  fb_lead_id?: string | null;
  external_payload?: Record<string, unknown> | null;
}

export interface IngestResult {
  ok: boolean;
  leadId?: string;
  deduped?: boolean;
  reason?: string;
}
