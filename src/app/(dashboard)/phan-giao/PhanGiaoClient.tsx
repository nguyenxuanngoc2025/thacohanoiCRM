'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AssignmentTree } from '@/components/settings/AssignmentManager';
import { FlashBar, Panel, PanelHeader } from '@/components/settings/ui';
import type { ShowroomRow, SalesTeamRow, RosterRow } from '@/components/settings/types';
import type { StaffRow } from '@/components/settings/AccountsManager';

// Trang cấu hình phân giao dành cho Giám đốc Showroom: dùng lại cây phân giao của
// trang Cài đặt nhưng chỉ với các showroom mình phụ trách (dữ liệu đã lọc ở server).
export default function PhanGiaoClient({
  showrooms, salesTeams, staff, roster,
}: {
  showrooms: ShowroomRow[];
  salesTeams: SalesTeamRow[];
  staff: StaffRow[];
  roster: RosterRow[];
}) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  return (
    <div className="space-y-4">
      <FlashBar msg={flash} />
      <Panel>
        <PanelHeader
          title="Cây phân giao lead"
          desc="Đặt kiểu chia trong showroom bạn phụ trách: showroom → phòng → TVBH. Cách chia lead vào showroom do quản trị công ty đặt ở mỗi kênh."
        />
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3.5 mb-4 text-[13px] leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-800">3 kiểu chia:</span>{' '}
          <b>Ít lead nhất</b> (ưu tiên nơi đang giữ ít lead chờ nhất) ·{' '}
          <b>Xoay vòng</b> (nơi lâu nhất chưa nhận thì tới lượt) ·{' '}
          <b>Theo tỷ lệ %</b> (mỗi nơi một phần trăm, tổng nên bằng 100%) ·{' '}
          <b>Theo lịch phòng trực</b> (chỉ cấp showroom → phòng: đặt lịch từng ngày, ngày nào phòng nào trực thì phòng đó nhận trọn lead ngày đó).
        </div>
        <AssignmentTree
          showrooms={showrooms}
          salesTeams={salesTeams}
          staff={staff}
          roster={roster}
          onDone={(m) => { flashMsg(m); router.refresh(); }}
        />
      </Panel>
    </div>
  );
}
