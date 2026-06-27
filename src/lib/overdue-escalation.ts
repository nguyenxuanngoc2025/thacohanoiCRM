export interface OverdueState {
  count: number;                 // overdue_reminder_count hiện tại
  nextContactAt: string;         // hạn liên hệ
  lastNotifiedAt: string | null; // last_overdue_notified_at
  gapHours: number;              // khoảng cách giữa 2 lần nhắc
}

export interface OverdueAction {
  notify: boolean;
  nextCount: number;
}

/** Quyết định có nhắc Zalo lần này không. Tối đa 2 lần; lần 2 cách lần 1 >= gapHours. */
export function decideOverdueAction(s: OverdueState, now: Date): OverdueAction {
  const t = now.getTime();
  if (s.count >= 2) return { notify: false, nextCount: s.count };
  if (s.count === 0) {
    const due = new Date(s.nextContactAt).getTime();
    return t >= due ? { notify: true, nextCount: 1 } : { notify: false, nextCount: 0 };
  }
  // count === 1
  const last = s.lastNotifiedAt ? new Date(s.lastNotifiedAt).getTime() : 0;
  const ready = t >= last + s.gapHours * 3600000;
  return ready ? { notify: true, nextCount: 2 } : { notify: false, nextCount: 1 };
}
