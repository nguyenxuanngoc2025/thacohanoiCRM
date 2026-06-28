/**
 * Gọi gateway HTTP localhost của supervisor bot (cùng VPS).
 * Trả { ok, status, data } — không ném; route tự ánh xạ thông báo.
 */
export async function callGateway(
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const base = process.env.ZALO_GATEWAY_URL || 'http://127.0.0.1:8787';
  const secret = process.env.ZALO_GATEWAY_SECRET || '';
  const qs = init?.query ? '?' + new URLSearchParams(init.query).toString() : '';
  try {
    const res = await fetch(`${base}${path}${qs}`, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', 'x-gateway-secret': secret },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      // tránh treo route nếu gateway chết
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 503, data: { error: 'Không kết nối được dịch vụ Zalo Bot, thử lại sau' } };
  }
}
