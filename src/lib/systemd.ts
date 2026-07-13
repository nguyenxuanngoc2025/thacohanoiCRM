import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rm } from 'node:fs/promises';

/**
 * Lớp chạy lệnh THẬT với systemd (app chạy root trên VPS). Dùng execFile (mảng argv,
 * KHÔNG qua shell) → miễn nhiễm command injection. Mọi tên unit truyền vào PHẢI được
 * route kiểm whitelist theo danh sách timer thật trước khi gọi các hàm ghi/đổi.
 * Đổi lịch = ghi drop-in override, không sửa file gốc → hoàn tác được.
 */

const pExecFile = promisify(execFile);

async function sysctl(args: string[]): Promise<string> {
  const { stdout } = await pExecFile('systemctl', args, { timeout: 15000 });
  return stdout;
}

/** Danh sách mọi timer + trạng thái file. */
export function listTimers(): Promise<string> {
  return sysctl(['list-unit-files', '--type=timer', '--no-legend', '--plain', '--no-pager']);
}

/** Thuộc tính cần cho 1 timer + service tương ứng (gọi 1 lệnh show cho mỗi). */
export function showTimer(unit: string): Promise<string> {
  return sysctl([
    'show', unit,
    '-p', 'Id', '-p', 'Description', '-p', 'ActiveState', '-p', 'UnitFileState',
    '-p', 'NextElapseUSecRealtime', '-p', 'LastTriggerUSec', '-p', 'TimersCalendar',
  ]);
}

export function showService(service: string): Promise<string> {
  return sysctl(['show', service, '-p', 'ActiveState', '-p', 'Result', '-p', 'ExecMainStatus']);
}

export async function enableTimer(unit: string): Promise<void> {
  await sysctl(['enable', '--now', unit]);
}

export async function disableTimer(unit: string): Promise<void> {
  await sysctl(['disable', '--now', unit]);
}

/** Chạy ngay: kích hoạt service tương ứng timer. */
export async function startService(service: string): Promise<void> {
  await sysctl(['start', service]);
}

export async function daemonReload(): Promise<void> {
  await sysctl(['daemon-reload']);
}

/** Kiểm tra cú pháp OnCalendar. true nếu hợp lệ. */
export async function validateCalendar(expr: string): Promise<boolean> {
  try {
    const { stdout, stderr } = await pExecFile('systemd-analyze', ['calendar', expr], { timeout: 10000 });
    return !/Failed to parse/i.test(stdout + stderr);
  } catch {
    return false;
  }
}

function overrideDir(timer: string): string {
  return `/etc/systemd/system/${timer}.d`;
}

/** Ghi drop-in override đặt lịch mới cho timer rồi daemon-reload. content dựng ở cron-admin. */
export async function writeOverride(timer: string, content: string): Promise<void> {
  const dir = overrideDir(timer);
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/override.conf`, content, 'utf8');
  await daemonReload();
}

/** Xoá override (hoàn tác về lịch gốc) rồi daemon-reload. */
export async function removeOverride(timer: string): Promise<void> {
  await rm(overrideDir(timer), { recursive: true, force: true });
  await daemonReload();
}
