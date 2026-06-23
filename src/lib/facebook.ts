const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION ?? 'v21.0'}`;

export interface FbLeadField { name: string; values: string[] }

/** Lấy chi tiết lead form từ Graph API bằng System User token. */
export async function fetchLeadDetail(leadgenId: string): Promise<{
  fullName: string | null; phone: string | null; raw: unknown;
}> {
  const token = process.env.FB_SYSTEM_USER_TOKEN!;
  const res = await fetch(`${GRAPH}/${leadgenId}?access_token=${token}`);
  const raw = await res.json();
  const fields: FbLeadField[] = raw?.field_data ?? [];
  const get = (keys: string[]) =>
    fields.find((f) => keys.includes(f.name))?.values?.[0] ?? null;
  return {
    fullName: get(['full_name', 'name', 'họ_và_tên']),
    phone: get(['phone_number', 'phone', 'số_điện_thoại']),
    raw,
  };
}
