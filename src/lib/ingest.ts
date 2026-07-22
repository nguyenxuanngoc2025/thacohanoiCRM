import { createServiceClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/phone';
import { looksLikePersonName, isTestLead } from '@/lib/person-name';
import { pickByStrategy, type AssignStrategy, type StrategyCandidate } from '@/lib/assign';
import { detectModel } from '@/lib/detect-model';
import { matchProvinceShowrooms } from '@/lib/route-province';
import { getOpenBrandIds, isBrandClosed } from '@/lib/company-brands';
import { vnDateStr, resolveRosterTeam } from '@/lib/roster';
import { resolveIngestScope } from '@/lib/ingest-scope';
import { resolvePushRecipients, type PushEvent, type PushUser } from '@/lib/push-recipients';
import { sendPushToUsers } from '@/lib/push';
import type { IngestPayload, IngestResult } from '@/types/database';

/** Cửa nạp lead chung — mọi kênh (FB webhook, n8n sau này) gọi vào đây. */
export async function ingestLead(payload: IngestPayload): Promise<IngestResult> {
  const db = createServiceClient();

  const phone = normalizePhone(payload.phone_raw);
  if (!phone) return { ok: false, reason: 'invalid_phone' };

  // Lead thử nghiệm (agency/tester đặt tên "test"): VẪN lưu để không mất dấu, nhưng KHÔNG báo Zalo.
  const testLead = isTestLead(payload.full_name);

  // Tra nguồn theo page_id
  const { data: channel } = await db
    .from('channel_accounts')
    .select('id, showroom_id, brand_id, campaign, showroom_assign_strategy, assign_effective_from')
    .eq('page_id', payload.page_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!channel) return { ok: false, reason: 'unknown_channel' };

  // 1 fanpage có thể phục vụ NHIỀU showroom (junction) + % phân bổ riêng của kênh này cho từng showroom.
  // Fallback: anchor showroom_id.
  const { data: junction } = await db
    .from('channel_account_showrooms')
    .select('showroom_id, share_pct')
    .eq('channel_account_id', channel.id);

  // Suy thương hiệu + tập showroom ứng viên. Google Sheet cấu hình riêng từng tab có thể GHI ĐÈ
  // brand_id/showroom_ids (payload); nguồn khác (FB webhook) không truyền → suy từ kênh + junction.
  const { brandId: effBrandId, candidateShowroomIds: rawShowroomIds } = resolveIngestScope({
    channelBrandId: channel.brand_id,
    channelShowroomId: channel.showroom_id,
    junctionShowroomIds: (junction ?? []).map((j) => j.showroom_id),
    overrideBrandId: payload.brand_id,
    overrideShowroomIds: payload.showroom_ids,
    hasBrandOverride: 'brand_id' in payload,
  });

  if (rawShowroomIds.length === 0) return { ok: false, reason: 'no_showroom' };

  // Công ty của kênh (mọi showroom của 1 kênh cùng thuộc 1 công ty) — cần SỚM để:
  //  (1) chống trùng theo ĐÚNG công ty (lead độc lập từng công ty),
  //  (2) đọc chiến lược phân giao cấp 1 ở dưới,
  //  (3) định tuyến theo địa chỉ trong PHẠM VI công ty đó.
  const { data: anchorSr } = await db
    .from('showrooms').select('company_id').in('id', rawShowroomIds).limit(1).maybeSingle();
  const companyId0 = anchorSr?.company_id ?? null;
  if (!companyId0) return { ok: false, reason: 'no_showroom' };

  // ĐỊNH TUYẾN THEO ĐỊA CHỈ (Google Sheet có cột địa chỉ): khớp tỉnh trong địa chỉ → tập showroom
  // của tỉnh đó (trong công ty). Trúng → dùng thay showroom_ids cấu hình. Không trúng → lùi về tỉnh
  // mặc định (vd Hà Nội). Vẫn không có → giữ showroom_ids/kênh như cũ. KHÔNG địa chỉ → bỏ qua.
  let candidateShowroomIds = rawShowroomIds;
  if (payload.address_text != null) {
    const { data: provSr } = await db
      .from('showrooms')
      .select('id, province, province_aliases')
      .eq('company_id', companyId0)
      .eq('is_active', true);
    const srList = (provSr ?? []) as { id: string; province: string | null; province_aliases: string[] | null }[];
    let matched = matchProvinceShowrooms(payload.address_text, srList);
    if (matched.length === 0 && payload.address_fallback_province) {
      matched = matchProvinceShowrooms(payload.address_fallback_province, srList);
    }
    if (matched.length > 0) candidateShowroomIds = matched;
  }

  // Kênh chuẩn hoá (lowercase) — lưu vào cột source để biết nguồn lead.
  const channelKey = (payload.source ?? 'facebook').trim().toLowerCase() || 'facebook';

  // Dòng xe: ưu tiên model_id chỉ định sẵn (Google Sheet gán cố định/theo cột);
  // nếu không có thì tự dò theo từ khoá — scope theo brand của fanpage, chỉ điền khi trúng đúng 1 dòng.
  // Dò TRƯỚC dedup để nhánh "khách cũ hỏi lại" cũng bù được dòng xe nếu lần này mới xác định ra.
  let modelId: string | null = null;
  let modelName: string | null = null;
  if (effBrandId && (payload.model_id || payload.intent_text)) {
    const { data: brandModels } = await db
      .from('models')
      .select('id, brand_id, name, keywords, is_active')
      .eq('brand_id', effBrandId)
      .eq('is_active', true);
    const models = (brandModels ?? []) as { id: string; brand_id: string; name: string; keywords: string[]; is_active: boolean }[];
    if (payload.model_id) {
      // Chỉ nhận model_id nếu đúng là dòng xe active của brand fanpage này.
      modelId = models.find((m) => m.id === payload.model_id)?.id ?? null;
    } else if (payload.intent_text) {
      modelId = detectModel({ brandId: effBrandId, text: payload.intent_text, models });
    }
    if (modelId) modelName = models.find((m) => m.id === modelId)?.name ?? null;
  }

  // Chống trùng theo (company_id, phone, brand_id) — lead quản lý độc lập theo công ty:
  // cùng SĐT + thương hiệu nhưng khác công ty là 2 lead riêng (KHÔNG coi là trùng).
  const { data: existing } = await db
    .from('leads')
    .select('id, assigned_to, sales_team_id, showroom_id, status, full_name, model_id, source')
    .eq('company_id', companyId0)
    .eq('phone', phone)
    .eq('brand_id', effBrandId)
    .maybeSingle();

  if (existing) {
    // KHÁCH CŨ HỎI LẠI: KHÔNG tạo dòng mới. Cập nhật vào dòng cũ (chỉ bù ô đang trống) + báo Zalo
    // vào nhóm phòng ĐANG chăm. Giữ nguyên TVBH/showroom/phòng/phân loại (không lật quyết định TVBH).
    const patch: Record<string, unknown> = {};
    const newName = payload.full_name?.trim();
    if (!existing.full_name?.trim() && newName && looksLikePersonName(newName)) patch.full_name = newName;
    if (!existing.model_id && modelId) patch.model_id = modelId;
    if (Object.keys(patch).length > 0) {
      await db.from('leads').update(patch).eq('id', existing.id);
    }

    // Google Sheet quét lại TOÀN BỘ sheet mỗi lần (5 phút/lần) → mọi lead cũ đều "trùng" mỗi lượt.
    // silent_dedup=true để KHÔNG ghi lead_logs + KHÔNG báo Zalo từng lượt (tránh spam);
    // chỉ bù thông tin ở trên. Data thật thời gian thực (FB/Zalo/nhập tay) mới ghi log + báo.
    if (!payload.silent_dedup) {
      const inquiry = payload.intent_text?.trim();
      await db.from('lead_logs').insert({
        lead_id: existing.id,
        type: 'system',
        content: `Khách cũ hỏi lại qua ${payload.source ?? 'facebook'}${inquiry ? `: ${inquiry.slice(0, 300)}` : ''}.`,
      });

      // Báo Zalo nhóm phòng đang chăm: chỉ khi lead cũ ĐÃ có phòng, không bị chặn báo,
      // hãng/showroom KHÔNG tắt (cùng cơ chế im lặng như lead mới).
      if (!payload.suppress_notify && !testLead && existing.sales_team_id) {
        const { data: sr } = await db
          .from('showrooms').select('company_id, is_active, name').eq('id', existing.showroom_id).maybeSingle();
        const openBrandIds = sr ? await getOpenBrandIds(db, sr.company_id) : [];
        const brandClosed = isBrandClosed(openBrandIds, effBrandId);
        const showroomClosed = (sr as { is_active?: boolean } | null)?.is_active === false;
        if (sr && !brandClosed && !showroomClosed) {
          const { data: chs } = await db
            .from('notification_channels')
            .select('id, channel, target, events, sales_team_id, sales_team_ids, scope')
            .eq('company_id', sr.company_id)
            .eq('is_active', true);
          const rTargets = (chs ?? []).filter((c) => {
            const ids = (c.sales_team_ids as string[] | null) ?? (c.sales_team_id ? [c.sales_team_id as string] : []);
            return (c.events ?? []).includes('new_lead') && c.scope === 'sales' && ids.includes(existing.sales_team_id!);
          });
          if (rTargets.length > 0) {
            const teamName = (await db.from('sales_teams').select('name').eq('id', existing.sales_team_id).maybeSingle()).data?.name ?? null;
            const assigneeName = existing.assigned_to
              ? (await db.from('users').select('full_name').eq('id', existing.assigned_to).maybeSingle()).data?.full_name ?? null
              : null;
            const { renderReturningLead } = await import('@/lib/notify-templates');
            const { loadSourceCatalog } = await import('@/lib/source-catalog');
            const catalog = await loadSourceCatalog(db);
            const text = renderReturningLead({
              showroom: sr.name ?? 'Showroom',
              team: teamName,
              fullName: (patch.full_name as string) ?? existing.full_name ?? null,
              phone,
              source: payload.source ?? 'facebook',
              originalSource: existing.source ?? null,
              inquiry: inquiry ?? null,
              assignee: assigneeName,
              status: existing.status ?? null,
              catalog,
            });
            await db.from('notifications').insert(rTargets.map((c) => ({
              lead_id: existing.id, channel: c.channel, channel_id: c.id, status: 'pending',
              payload: { event: 'new_lead', leadId: existing.id, target: c.target, text },
            })));
          }
        }
      }
    }
    return { ok: true, leadId: existing.id, deduped: true };
  }

  // Phòng bán hàng (sales_teams) nhận lead của hãng fanpage này, trong các showroom ứng viên.
  // Phòng gắn TẬP hãng cụ thể (brand_ids): chỉ nhận khi brand_ids chứa hãng của kênh.
  // Kênh không có brand (hiếm) → không lọc theo hãng, lấy mọi phòng ứng viên (best effort).
  let teamsQ = db
    .from('sales_teams')
    .select('id, showroom_id')
    .in('showroom_id', candidateShowroomIds);
  if (effBrandId) teamsQ = teamsQ.contains('brand_ids', [effBrandId]);
  const { data: teamsAll } = await teamsQ;

  const teamsByShowroom = new Map<string, string[]>();
  const teamIds: string[] = [];
  for (const t of teamsAll ?? []) {
    teamIds.push(t.id);
    const arr = teamsByShowroom.get(t.showroom_id) ?? [];
    arr.push(t.id);
    teamsByShowroom.set(t.showroom_id, arr);
  }

  // TVBH active theo phòng (1 truy vấn). Map theo sales_team_id.
  const { data: tvbhAll } = teamIds.length
    ? await db
        .from('users')
        .select('id, sales_team_id')
        .in('sales_team_id', teamIds)
        .eq('role', 'tvbh')
        .eq('is_active', true)
    : { data: [] as { id: string; sales_team_id: string | null }[] };

  const tvbhByTeam = new Map<string, string[]>();
  for (const t of tvbhAll ?? []) {
    if (!t.sales_team_id) continue;
    const arr = tvbhByTeam.get(t.sales_team_id) ?? [];
    arr.push(t.id);
    tvbhByTeam.set(t.sales_team_id, arr);
  }

  // CẤP 1 — chọn showroom theo chiến lược cấu hình NGAY TRÊN KÊNH (theo từng kênh, KHÔNG còn global công ty).
  // Chỉ xét showroom có ≥1 phòng-của-brand có ≥1 TVBH active; nếu không có thì xét hết.
  const showroomHasTvbh = (sid: string) =>
    (teamsByShowroom.get(sid) ?? []).some((tid) => (tvbhByTeam.get(tid)?.length ?? 0) > 0);
  const withTvbh = candidateShowroomIds.filter(showroomHasTvbh);
  const showroomPool = withTvbh.length > 0 ? withTvbh : candidateShowroomIds;

  // Kiểu chia cấp 1: ưu tiên override từ payload (Google Sheet cấu hình từng tab), thiếu thì lấy từ KÊNH.
  // % từng showroom: từ payload.showroom_shares nếu có, nếu không thì junction (mỗi kênh 1 bộ % riêng).
  const showroomStrategy = (payload.showroom_assign_strategy ?? channel.showroom_assign_strategy ?? 'least_loaded') as AssignStrategy;
  const shareBySr = new Map<string, number>(
    payload.showroom_shares
      ? Object.entries(payload.showroom_shares).map(([k, v]) => [k, Number(v) || 0])
      : (junction ?? []).map((j) => [j.showroom_id, Number(j.share_pct) || 0])
  );

  // Mốc hiệu lực: chỉ đếm lead phát sinh SAU lần đổi cấu hình chia gần nhất ("hiệu lực kể từ thời điểm
  // thay đổi"). NULL = đếm toàn thời gian. Áp cho cả tải (weighted/least_loaded) lẫn mốc xoay vòng.
  const effectiveFrom = channel.assign_effective_from ?? null;

  const showroomCands: StrategyCandidate[] = [];
  for (const sid of showroomPool) {
    // Đếm tải + lead gần nhất CHỈ của kênh này (channel_account_id) → tỷ lệ % của kênh không bị
    // nhiễu bởi lead từ kênh/thương hiệu khác cùng đổ vào showroom.
    let countQ = db.from('leads').select('id', { count: 'exact', head: true })
      .eq('showroom_id', sid).eq('channel_account_id', channel.id).or('status.is.null,status.neq.Fail');
    if (effectiveFrom) countQ = countQ.gte('created_at', effectiveFrom);
    const { count } = await countQ;
    let lastQ = db.from('leads').select('created_at')
      .eq('showroom_id', sid).eq('channel_account_id', channel.id).order('created_at', { ascending: false }).limit(1);
    if (effectiveFrom) lastQ = lastQ.gte('created_at', effectiveFrom);
    const { data: last } = await lastQ.maybeSingle();
    showroomCands.push({
      id: sid,
      activeLeadCount: count ?? 0,
      sharePct: shareBySr.get(sid) ?? 0,
      lastAssignedAt: last?.created_at ? new Date(last.created_at).getTime() : null,
    });
  }
  const chosenShowroomId = pickByStrategy(showroomStrategy, showroomCands) ?? candidateShowroomIds[0];

  // Công ty của showroom đã chọn
  const { data: showroom } = await db
    .from('showrooms')
    .select('id, company_id, is_active, name')
    .eq('id', chosenShowroomId)
    .maybeSingle();

  if (!showroom) return { ok: false, reason: 'unknown_showroom' };

  // Hãng đang TẮT (gỡ khỏi whitelist company_brands)? → VẪN nhận + phân giao lead bình
  // thường (không mất lead), nhưng KHÔNG bắn tin Zalo. Bật lại hãng → lead vẫn còn nguyên.
  const openBrandIds = await getOpenBrandIds(db, showroom.company_id);
  const brandClosed = isBrandClosed(openBrandIds, effBrandId);

  // Showroom đang TẮT (platform_owner tắt tại /admin, vượt hạn mức)? → cùng cơ chế: nhận +
  // phân giao ngầm, KHÔNG báo Zalo. Đọc thẳng cột is_active của showroom đã chọn.
  const showroomClosed = (showroom as { is_active: boolean }).is_active === false;

  // Luật phân giao: rule showroom (priority cao) ưu tiên hơn rule mặc định toàn công ty
  const { data: rules } = await db
    .from('assignment_rules')
    .select('showroom_id, strategy, specific_user_id, priority')
    .eq('company_id', showroom.company_id)
    .eq('is_active', true);

  const applicable = (rules ?? [])
    .filter((r) => r.showroom_id === chosenShowroomId || r.showroom_id === null)
    .sort((a, b) => {
      // ưu tiên: số priority cao trước; cùng priority thì rule showroom trước rule mặc định
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (b.showroom_id ? 1 : 0) - (a.showroom_id ? 1 : 0);
    });
  const rule = applicable[0];

  let assignedTo: string | null = null;
  let chosenTeamId: string | null = null;

  if (rule?.strategy === 'specific_user' && rule.specific_user_id) {
    // Rule chỉ định TVBH cố định → suy ra phòng của TVBH đó.
    assignedTo = rule.specific_user_id;
    const { data: u } = await db
      .from('users')
      .select('sales_team_id')
      .eq('id', rule.specific_user_id)
      .maybeSingle();
    chosenTeamId = u?.sales_team_id ?? null;
  } else {
    // CẤP 2 — chọn phòng trong showroom theo chiến lược cấu hình ở showroom đã chọn.
    const teamsInShowroom = teamsByShowroom.get(chosenShowroomId) ?? [];
    const teamsWithTvbh = teamsInShowroom.filter((tid) => (tvbhByTeam.get(tid)?.length ?? 0) > 0);
    const teamPool = teamsWithTvbh.length > 0 ? teamsWithTvbh : teamsInShowroom;

    const { data: srCfg } = await db
      .from('showrooms').select('team_assign_strategy').eq('id', chosenShowroomId).maybeSingle();
    const teamStrategy = (srCfg?.team_assign_strategy ?? 'weighted') as AssignStrategy;

    // LỊCH TRỰC THEO NGÀY: quản lý showroom đặt ngày nào phòng nào nhận → ép TOÀN BỘ lead ngày đó
    // về phòng trực (miễn phòng đó bán hãng của lead). Ngày trống lịch → giữ chưa phân giao + nhắc Zalo.
    // rosterHandled=true = đã quyết định xong (assign hoặc để trống có chủ đích) → bỏ qua khối chia đều.
    let rosterHandled = false;
    if (teamStrategy === 'day_roster') {
      const today = vnDateStr(new Date());
      const { data: rosterRow } = await db
        .from('showroom_day_roster')
        .select('sales_team_id')
        .eq('showroom_id', chosenShowroomId)
        .eq('roster_date', today)
        .maybeSingle();
      const res = resolveRosterTeam(rosterRow?.sales_team_id ?? null, teamPool);
      if (res.mode === 'assign') {
        chosenTeamId = res.teamId!;
        rosterHandled = true;
      } else if (res.mode === 'unassigned') {
        // Chưa đặt phòng trực hôm nay → lead giữ chưa phân giao; nhắc Zalo (1 lần/ngày/showroom).
        rosterHandled = true;
        if (!showroomClosed && !payload.suppress_notify && !testLead) {
          const { data: dup } = await db.from('notifications').select('id')
            .eq('payload->>event', 'roster_reminder')
            .eq('payload->>showroomId', chosenShowroomId)
            .eq('payload->>date', today).limit(1);
          if (!dup || dup.length === 0) {
            const { data: chs } = await db.from('notification_channels')
              .select('id, channel, target, scope, showroom_id, sales_team_id')
              .eq('company_id', showroom.company_id).eq('is_active', true);
            const mgmt = (chs ?? []).filter((c) => c.scope === 'management' && c.showroom_id === chosenShowroomId);
            const sales = (chs ?? []).filter((c) => c.scope === 'sales' && c.sales_team_id && teamsInShowroom.includes(c.sales_team_id));
            const rTargets = mgmt.length > 0 ? mgmt : sales;
            if (rTargets.length > 0) {
              const { renderRosterMissing } = await import('@/lib/notify-templates');
              const rtext = renderRosterMissing(showroom.name ?? 'Showroom', `${today.slice(8, 10)}/${today.slice(5, 7)}`);
              await db.from('notifications').insert(rTargets.map((c) => ({
                lead_id: null, channel: c.channel, channel_id: c.id, status: 'pending',
                payload: { event: 'roster_reminder', showroomId: chosenShowroomId, date: today, target: c.target, text: rtext },
              })));
            }
          }
        }
      }
      // res.mode === 'fallback' → rosterHandled vẫn false → chạy khối chia đều bên dưới (chia weighted cho lead hãng đó).
    }

    if (!rosterHandled && teamPool.length > 0) {
      const { data: teamMeta } = await db
        .from('sales_teams').select('id, assign_share_pct').in('id', teamPool);
      const shareByTeam = new Map<string, number>((teamMeta ?? []).map((t) => [t.id, Number(t.assign_share_pct) || 0]));

      const teamCands: StrategyCandidate[] = [];
      for (const tid of teamPool) {
        // Đếm tải THEO ĐÚNG HÃNG của lead đang vào (brand_id) → mỗi hãng cân bằng độc lập:
        // phòng đa hãng KIA+Mazda thì lead KIA chia đều theo tải KIA, lead Mazda theo tải Mazda
        // (không gộp chung 2 hãng làm lệch). Showroom 1 hãng → lọc hãng vô tác dụng, y như cũ.
        // Áp mốc effectiveFrom giống cấp 1 để tải không lệch bởi lead cũ trước lần đổi cấu hình.
        let teamCountQ = db.from('leads').select('id', { count: 'exact', head: true })
          .eq('sales_team_id', tid).or('status.is.null,status.neq.Fail');
        if (effBrandId) teamCountQ = teamCountQ.eq('brand_id', effBrandId);
        if (effectiveFrom) teamCountQ = teamCountQ.gte('created_at', effectiveFrom);
        const { count } = await teamCountQ;
        let teamLastQ = db.from('leads').select('created_at')
          .eq('sales_team_id', tid).order('created_at', { ascending: false }).limit(1);
        if (effBrandId) teamLastQ = teamLastQ.eq('brand_id', effBrandId);
        if (effectiveFrom) teamLastQ = teamLastQ.gte('created_at', effectiveFrom);
        const { data: last } = await teamLastQ.maybeSingle();
        teamCands.push({
          id: tid, activeLeadCount: count ?? 0,
          sharePct: shareByTeam.get(tid) ?? 0,
          lastAssignedAt: last?.created_at ? new Date(last.created_at).getTime() : null,
        });
      }
      chosenTeamId = pickByStrategy(teamStrategy, teamCands);
    }

    // CẤP 3 — chọn TVBH trong phòng theo chiến lược cấu hình ở phòng đã chọn.
    if (chosenTeamId) {
      const tvbhIds = tvbhByTeam.get(chosenTeamId) ?? [];
      if (tvbhIds.length > 0) {
        const { data: teamCfg } = await db
          .from('sales_teams').select('tvbh_assign_strategy').eq('id', chosenTeamId).maybeSingle();
        const tvbhStrategy = (teamCfg?.tvbh_assign_strategy ?? 'least_loaded') as AssignStrategy;
        const { data: uMeta } = await db.from('users').select('id, assign_share_pct').in('id', tvbhIds);
        const shareByUser = new Map<string, number>((uMeta ?? []).map((u) => [u.id, Number(u.assign_share_pct) || 0]));
        const tvbhCands: StrategyCandidate[] = [];
        for (const id of tvbhIds) {
          // Cũng đếm tải THEO ĐÚNG HÃNG của lead (brand_id) → trong phòng đa hãng, mỗi TVBH
          // nhận đều KIA và đều Mazda riêng biệt (không gộp). Áp mốc effectiveFrom như cấp 1, 2.
          let tvbhCountQ = db.from('leads').select('id', { count: 'exact', head: true })
            .eq('assigned_to', id).or('status.is.null,status.neq.Fail');
          if (effBrandId) tvbhCountQ = tvbhCountQ.eq('brand_id', effBrandId);
          if (effectiveFrom) tvbhCountQ = tvbhCountQ.gte('created_at', effectiveFrom);
          const { count } = await tvbhCountQ;
          let tvbhLastQ = db.from('leads').select('created_at')
            .eq('assigned_to', id).order('created_at', { ascending: false }).limit(1);
          if (effBrandId) tvbhLastQ = tvbhLastQ.eq('brand_id', effBrandId);
          if (effectiveFrom) tvbhLastQ = tvbhLastQ.gte('created_at', effectiveFrom);
          const { data: last } = await tvbhLastQ.maybeSingle();
          tvbhCands.push({
            id, activeLeadCount: count ?? 0,
            sharePct: shareByUser.get(id) ?? 0,
            lastAssignedAt: last?.created_at ? new Date(last.created_at).getTime() : null,
          });
        }
        assignedTo = pickByStrategy(tvbhStrategy, tvbhCands);
      }
    }
  }

  // SLA vòng 1: hạn liên hệ lần đầu → next_contact_at
  const { data: sla } = await db
    .from('sla_config')
    .select('first_response_hours')
    .eq('company_id', showroom.company_id)
    .eq('round', 1)
    .eq('is_active', true)
    .maybeSingle();
  // Backfill: neo hạn liên hệ vào mốc GỐC (created_at_override) thay vì now() để SLA đúng lịch sử.
  const baseTime = payload.created_at_override ? new Date(payload.created_at_override).getTime() : Date.now();
  const nextContactAt = sla
    ? new Date(baseTime + sla.first_response_hours * 3600 * 1000).toISOString()
    : null;

  const { data: inserted, error } = await db
    .from('leads')
    .insert({
      company_id: showroom.company_id,
      showroom_id: chosenShowroomId,
      sales_team_id: chosenTeamId,
      brand_id: effBrandId,
      model_id: modelId,
      channel_account_id: channel.id,
      assigned_to: assignedTo,
      phone,
      phone_raw: payload.phone_raw,
      full_name: payload.full_name ?? null,
      source: channelKey, // chuẩn hoá lowercase để đếm/khớp tỷ trọng theo kênh
      status: null, // chưa phân loại — TVBH phân loại sau khi liên hệ
      round: 1,
      next_contact_at: nextContactAt,
      fb_lead_id: payload.fb_lead_id ?? null,
      external_payload: payload.external_payload ?? null,
      // Backfill lead lịch sử: đặt đúng thời điểm gốc (không có override → DB tự điền now()).
      ...(payload.created_at_override ? { created_at: payload.created_at_override } : {}),
    })
    .select('id')
    .single();

  if (error || !inserted) return { ok: false, reason: error?.message ?? 'insert_failed' };

  // KHÁCH CŨ trên B10: tra kho đối soát (b10_records) theo (company_id, phone). Nếu có →
  // đánh dấu tham chiếu lên lead (b10_status/b10_care_note/b10_synced_at) để user có căn cứ
  // phân giao. KHÔNG đổi trạng thái chính / last_contact_at (chỉ tham chiếu, không lật quyết định).
  let b10Prior: { status: string | null; note: string | null } | null = null;
  const { data: b10Rec } = await db
    .from('b10_records')
    .select('b10_status, care_note')
    .eq('company_id', showroom.company_id)
    .eq('phone', phone)
    .maybeSingle();
  if (b10Rec) {
    b10Prior = { status: b10Rec.b10_status ?? null, note: b10Rec.care_note ?? null };
    await db.from('leads').update({
      b10_status: b10Rec.b10_status ?? null,
      b10_care_note: b10Rec.care_note ?? null,
      b10_synced_at: new Date().toISOString(),
    }).eq('id', inserted.id);
    await db.from('lead_logs').insert({
      lead_id: inserted.id,
      type: 'system',
      content: `Khách cũ — đã có trên B10${b10Rec.b10_status ? ` (${b10Rec.b10_status})` : ''}.`,
    });
  }

  // Hãng đang tắt: ghi 1 dòng log để truy vết, và bỏ qua toàn bộ khối báo Zalo bên dưới.
  if (brandClosed) {
    await db.from('lead_logs').insert({
      lead_id: inserted.id,
      type: 'system',
      content: 'Thương hiệu đang tắt — nhận lead nhưng không báo Zalo.',
    });
  }

  if (showroomClosed) {
    await db.from('lead_logs').insert({
      lead_id: inserted.id,
      type: 'system',
      content: 'Showroom đang tắt — nhận lead nhưng không báo Zalo.',
    });
  }

  // Đẩy thông báo Zalo: CHỈ group của ĐÚNG PHÒNG đã chọn + có sự kiện 'new_lead'.
  // Nhóm BLĐ (scope='management') KHÔNG nhận từng lead — chỉ nhận báo cáo. Lead chưa thuộc
  // phòng nào (chosenTeamId null) → không có group để báo → bỏ qua.
  // Backfill lead lịch sử: bỏ qua toàn bộ thông báo để không spam nhóm Zalo bằng lead cũ.
  // Hãng tắt (brandClosed): bỏ qua báo Zalo (lead vẫn được nhận + phân giao ở trên).
  const { data: notifChannels } = chosenTeamId && !payload.suppress_notify && !testLead && !brandClosed && !showroomClosed
    ? await db
        .from('notification_channels')
        .select('id, channel, target, events, sales_team_id, sales_team_ids, scope')
        .eq('company_id', showroom.company_id)
        .eq('is_active', true)
    : { data: [] };

  const targets = (notifChannels ?? []).filter((c) => {
    const ids = (c.sales_team_ids as string[] | null) ?? (c.sales_team_id ? [c.sales_team_id as string] : []);
    return (c.events ?? []).includes('new_lead') && c.scope === 'sales' && !!chosenTeamId && ids.includes(chosenTeamId);
  });

  if (targets.length > 0) {
    // Tên showroom + dòng xe + TVBH để render text (1 truy vấn mỗi loại)
    const { data: srRow } = await db
      .from('showrooms').select('name').eq('id', chosenShowroomId).maybeSingle();
    const teamName = chosenTeamId
      ? (await db.from('sales_teams').select('name').eq('id', chosenTeamId).maybeSingle()).data?.name ?? null
      : null;
    const assigneeName = assignedTo
      ? (await db.from('users').select('full_name').eq('id', assignedTo).maybeSingle()).data?.full_name ?? null
      : null;

    const fullName = payload.full_name ?? null;
    const { renderNewLead } = await import('@/lib/notify-templates');
    const { loadSourceCatalog } = await import('@/lib/source-catalog');
    const catalog = await loadSourceCatalog(db);
    const text = renderNewLead({
      showroom: srRow?.name ?? 'Showroom',
      team: teamName,
      fullName,
      phone,
      source: payload.source ?? 'facebook',
      model: modelName,
      assignee: assigneeName,
      b10Prior,
      catalog,
    });

    // Tên rác → kèm enrich để bot tra Zalo bù tên TRƯỚC khi gửi.
    // badName = đúng chuỗi tên đang nằm trong text (để bot replace chính xác).
    const enrich = !looksLikePersonName(fullName)
      ? { leadId: inserted.id, phone, badName: (fullName?.trim() || 'Khách lẻ') }
      : null;

    await db.from('notifications').insert(
      targets.map((c) => ({
        lead_id: inserted.id,
        channel: c.channel,
        channel_id: c.id,
        status: 'pending',
        payload: { event: 'new_lead', leadId: inserted.id, target: c.target, text, ...(enrich ? { enrich } : {}) },
      }))
    );
  }

  // ── Web Push cá nhân (song song Zalo, KHÔNG chặn luồng) ────────────────────
  // Cùng cổng chặn như Zalo: không backfill, không test, hãng/showroom tắt, không suppress.
  if (!payload.suppress_notify && !testLead && !brandClosed && !showroomClosed && !payload.created_at_override) {
    const pushEvent: PushEvent = assignedTo
      ? 'new_lead_assigned'
      : chosenTeamId
        ? 'new_lead_unassigned'
        : 'new_lead_no_team';
    const displayName = (payload.full_name?.trim() || 'Khách lẻ');
    void (async () => {
      // Nạp user + showroom-map của công ty để resolver quyết người nhận (hàm thuần).
      const [{ data: uRows }, { data: usRows }] = await Promise.all([
        db.from('users').select('id, role, company_id, sales_team_id').eq('company_id', showroom.company_id),
        db.from('user_showrooms').select('user_id, showroom_id'),
      ]);
      const srByUser = new Map<string, string[]>();
      for (const r of (usRows ?? []) as { user_id: string; showroom_id: string }[]) {
        const arr = srByUser.get(r.user_id) ?? []; arr.push(r.showroom_id); srByUser.set(r.user_id, arr);
      }
      const users: PushUser[] = ((uRows ?? []) as { id: string; role: string; company_id: string | null; sales_team_id: string | null }[])
        .map((u) => ({ ...u, showroom_ids: srByUser.get(u.id) ?? [] }));
      const userIds = resolvePushRecipients(pushEvent, {
        company_id: showroom.company_id, sales_team_id: chosenTeamId, showroom_id: chosenShowroomId, assignee_id: assignedTo,
      }, users);
      await sendPushToUsers(db, showroom.company_id, userIds, {
        title: 'Lead mới', body: `${displayName} · ${phone}`, url: '/leads', tag: `lead-${inserted.id}`,
      });
    })().catch(() => {});
  }

  return { ok: true, leadId: inserted.id, deduped: false };
}
