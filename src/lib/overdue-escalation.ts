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

// Số lần gọi hụt tối đa còn tự động nhắc "gọi lại"; đạt ngưỡng coi như khách khó liên hệ, ngừng nhắc.
export const MAX_NO_ANSWER = 3;

export interface CallbackState {
  noAnswerCount: number;         // số lần TVBH đã bấm "Chưa LH được"
  nextContactAt: string | null;  // mốc nhắc gọi lại kế (đặt = lúc bấm gọi hụt + gap)
  lastNotifiedAt: string | null; // last_overdue_notified_at (lần nhắc gọi lại gần nhất)
  gapHours: number;              // chu kỳ nhắc lại
  maxNoAnswer?: number;          // ngưỡng dừng (mặc định MAX_NO_ANSWER)
}

/**
 * Quyết định có nhắc "gọi lại" cho lead 'Chưa LH được' lần này không.
 * Nhắc lặp mỗi gapHours cho tới khi TVBH đổi phân loại (lead rời truy vấn) HOẶC
 * số lần gọi hụt đạt ngưỡng. Lần đầu nhắc khi tới nextContactAt; các lần sau cách
 * lần nhắc trước >= gapHours.
 */
export function decideCallbackReminder(s: CallbackState, now: Date): { notify: boolean } {
  const max = s.maxNoAnswer ?? MAX_NO_ANSWER;
  if (s.noAnswerCount >= max) return { notify: false };
  const t = now.getTime();
  if (s.lastNotifiedAt) {
    const last = new Date(s.lastNotifiedAt).getTime();
    return { notify: t >= last + s.gapHours * 3600000 };
  }
  if (!s.nextContactAt) return { notify: false };
  return { notify: t >= new Date(s.nextContactAt).getTime() };
}
