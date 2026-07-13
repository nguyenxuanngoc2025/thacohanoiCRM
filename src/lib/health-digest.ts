import type { SystemHealth, HealthStatus, HealthGroup } from './system-health';

/**
 * Soạn tin "báo cáo sức khoẻ" chủ động (gửi sáng/tối) từ kết quả gatherSystemHealth.
 * Hàm THUẦN — không I/O, dễ test. Quy giờ VN (UTC+7) từ mốc `now` để hiện phase + giờ.
 * Khác watchdog: LUÔN soạn tin kể cả khi mọi thứ xanh (để trấn an người vận hành).
 */

const ICON: Record<HealthStatus, string> = { ok: '✅', warn: '⚠️', fail: '❌' };
const WORST: Record<HealthStatus, number> = { ok: 0, warn: 1, fail: 2 };

function groupStatus(g: HealthGroup): HealthStatus {
  let s: HealthStatus = 'ok';
  for (const it of g.items) if (WORST[it.status] > WORST[s]) s = it.status;
  return s;
}

const p2 = (n: number) => String(n).padStart(2, '0');

export function buildHealthDigestText(companyName: string, health: SystemHealth, now: Date): string {
  const vn = new Date(now.getTime() + 7 * 3600000); // giờ VN
  const phase = vn.getUTCHours() < 12 ? 'sáng' : 'tối';
  const clock = `${p2(vn.getUTCHours())}:${p2(vn.getUTCMinutes())}`;
  const date = `${p2(vn.getUTCDate())}/${p2(vn.getUTCMonth() + 1)}`;
  const stamp = `Báo cáo ${phase} ${clock} ${date}`;

  const allItems = health.groups.flatMap((g) => g.items);
  const failCount = allItems.filter((it) => it.status === 'fail').length;
  const warnCount = allItems.filter((it) => it.status === 'warn').length;

  let header: string;
  if (health.overall === 'ok') header = `${ICON.ok} CRM VẪN KHOẺ — ${stamp}`;
  else if (health.overall === 'fail') header = `${ICON.fail} CRM CÓ ${failCount} MỤC LỖI — ${stamp}`;
  else header = `${ICON.warn} CRM CÓ ${warnCount} MỤC CẦN CHÚ Ý — ${stamp}`;

  const lines: string[] = [`<b>${header}</b>`, companyName, ''];

  for (const g of health.groups) {
    const gs = groupStatus(g);
    if (gs === 'ok') {
      const summary = g.items.length === 1 ? g.items[0].detail : `${g.items.length}/${g.items.length} tốt`;
      lines.push(`• ${g.title}: ${ICON.ok} ${summary}`);
    } else {
      lines.push(`• ${g.title}: ${ICON[gs]}`);
      for (const it of g.items) {
        if (it.status === 'ok') continue;
        lines.push(`   ${ICON[it.status]} ${it.label}: ${it.detail}`);
        if (it.fix) lines.push(`      → ${it.fix}`);
      }
    }
  }

  lines.push('');
  if (health.overall === 'ok') lines.push('Mọi kênh thu lead hoạt động bình thường.');
  else if (health.overall === 'fail') lines.push('Cần xử lý sớm mục ❌ để không sót lead.');
  else lines.push('Có mục cần để ý (⚠️) — lead vẫn về bình thường.');

  return lines.join('\n');
}
