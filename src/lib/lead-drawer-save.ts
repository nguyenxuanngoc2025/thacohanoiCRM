// Quy tắc thuần cho popup KH (LeadDrawer): so sánh giá trị gốc vs nháp để biết field nào đổi.
// Việc BỎ QUA reassignLead khi đổi phòng đã xoá phụ trách phụ thuộc clearedAssignee runtime → xử lý ở handler.

export interface DrawerBaseline {
  source: string;
  salesTeamId: string;
  assignedTo: string;
  status: string;
  modelId: string;
  nextDate: string;
  /** Lý do loại đã gộp (reasonSel === 'Khác' ? customReason : reasonSel). */
  failReason: string;
}

export interface DrawerDraft extends DrawerBaseline {
  /** Nội dung liên hệ mới (ô ghi chú) — chỉ tính dirty khi có nội dung thực. */
  note: string;
}

export interface DrawerSavePlan {
  sourceChanged: boolean;
  teamChanged: boolean;
  assigneeChanged: boolean;
  /** Nhóm field đi qua updateLead: phân loại/lý do/dòng xe/hẹn gọi lại/ghi chú. */
  fieldsChanged: boolean;
}

export function planDrawerSave(base: DrawerBaseline, draft: DrawerDraft): DrawerSavePlan {
  return {
    sourceChanged: draft.source !== base.source,
    teamChanged: draft.salesTeamId !== base.salesTeamId,
    assigneeChanged: draft.assignedTo !== base.assignedTo,
    fieldsChanged:
      draft.status !== base.status ||
      draft.modelId !== base.modelId ||
      draft.nextDate !== base.nextDate ||
      draft.failReason !== base.failReason ||
      draft.note.trim() !== '',
  };
}

export function isDrawerDirty(plan: DrawerSavePlan): boolean {
  return plan.sourceChanged || plan.teamChanged || plan.assigneeChanged || plan.fieldsChanged;
}
