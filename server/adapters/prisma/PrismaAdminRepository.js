/**
 * PrismaAdminRepository — 관리자/perf 분석 복합 쿼리 (INFRA-A6)
 * enc 없음, tx 없음 — 저위험 analytics
 */
const { Prisma } = require('@prisma/client');

class PrismaAdminRepository {
  constructor(prismaClient) {
    if (!prismaClient) throw new Error('PrismaAdminRepository requires prismaClient');
    this.prisma = prismaClient;
  }

  // 전직원 목록 (is_active=1, approved)
  async findActiveUsers() {
    const rows = await this.prisma.$queryRaw`
      SELECT id, name, dept, title FROM users
      WHERE is_active=1 AND (account_status='approved' OR account_status IS NULL)
      ORDER BY dept, name
    `;
    return this._toNum(rows);
  }

  // BigInt → Number 변환 헬퍼 (Prisma raw COUNT(*) 결과)
  _toNum(rows) {
    return rows.map(r => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = typeof v === 'bigint' ? Number(v) : v;
      }
      return out;
    });
  }

  // 특정 사용자의 평가 사이클 + 집계 (period_ids 필터)
  async findUserEvalCycles(userId, periodIds) {
    const rows = await this.prisma.$queryRaw`
      SELECT ec.id as eval_id, ec.eval_year, ec.period_label, ec.phase,
             ec.submitted_at, ec.approved_at, ec.locked,
             COALESCE(ep.eval_mode, 'MBO') as eval_mode,
             (SELECT COUNT(*) FROM goals    WHERE eval_id=ec.id) as goal_count,
             (SELECT COUNT(*) FROM feedbacks WHERE eval_id=ec.id) as feedback_count,
             fe.id as final_eval_id, fe.final_score, fe.final_grade
      FROM eval_cycles ec
      LEFT JOIN eval_periods ep ON ep.eval_year=ec.eval_year AND ep.period_label=ec.period_label
                                AND ep.id IN (${Prisma.join(periodIds)})
      LEFT JOIN final_evaluations fe ON fe.eval_id=ec.id
      WHERE ec.user_id=${Number(userId)} AND ep.id IN (${Prisma.join(periodIds)})
      ORDER BY ec.eval_year DESC, ec.period_label DESC
    `;
    return this._toNum(rows);
  }

  // 특정 사용자의 최신 eval_cycle (period 선택)
  async findLatestUserEvalForPeriod(userId, periodLabel, evalYear) {
    const pl = periodLabel || '';
    const ey = evalYear || '';
    const rows = await this.prisma.$queryRaw`
      SELECT ec.id, ec.eval_year, ec.period_label, ec.phase,
             COALESCE(ep.eval_mode, 'MBO') as eval_mode
      FROM eval_cycles ec
      LEFT JOIN eval_periods ep ON ep.period_label=ec.period_label AND ep.eval_year=ec.eval_year
      WHERE ec.user_id=${Number(userId)}
        AND (ec.period_label=${pl} OR ${pl}='') AND (ec.eval_year=${ey} OR ${ey}='')
      ORDER BY ec.created_at DESC LIMIT 1
    `;
    return rows[0] || null;
  }

  // 특정 eval의 보고·피드백 카운트
  async getEvalCounts(evalId) {
    const id = Number(evalId);
    const rows = await this.prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM progress_reports WHERE eval_id=${id}) as report_count,
        (SELECT COUNT(*) FROM feedbacks WHERE eval_id=${id}) as feedback_count
    `;
    return rows[0] || { report_count: 0, feedback_count: 0 };
  }

  // OKR 사이클 + objectives + key_results (사용자/기간)
  async findOkrCycleWithDetails(userId, periodLabel, evalYear) {
    const cycles = await this.prisma.$queryRaw`
      SELECT * FROM okr_cycles WHERE user_id=${Number(userId)} AND period_label=${periodLabel} AND eval_year=${evalYear}
    `;
    for (const c of cycles) {
      const objs = await this.prisma.$queryRaw`
        SELECT * FROM okr_objectives WHERE cycle_id=${Number(c.id)} ORDER BY sort_order
      `;
      for (const obj of objs) {
        obj.key_results = await this.prisma.$queryRaw`
          SELECT * FROM okr_key_results WHERE objective_id=${Number(obj.id)} ORDER BY sort_order
        `;
      }
      c.objectives = objs;
    }
    return cycles;
  }

  // 조직 찾기 (leader_id 기준)
  async findOrgByLeader(leaderId) {
    const rows = await this.prisma.$queryRaw`
      SELECT * FROM organizations WHERE leader_id=${Number(leaderId)} AND is_active=1 LIMIT 1
    `;
    return rows[0] || null;
  }

  // 조직 하위 멤버 (iterative, 최대 depth)
  async findOrgMembers(orgId, maxDepth = 3) {
    const members = [];
    const directMembers = await this.prisma.$queryRaw`
      SELECT id, name, title FROM users WHERE org_id=${Number(orgId)} AND is_active=1
    `;
    const subOrgs = await this.prisma.$queryRaw`
      SELECT * FROM organizations WHERE parent_id=${Number(orgId)} AND is_active=1
    `;
    members.push(...directMembers);
    for (const sub of subOrgs) {
      const subMembers = await this.findOrgMembers(sub.id, maxDepth - 1);
      members.push(...subMembers);
    }
    return members;
  }

  // eval_cycles + final_evaluations (사용자/기간 기준)
  async findEvalForUserAndPeriod(userId, periodLabel, evalYear) {
    const rows = await this.prisma.$queryRaw`
      SELECT e.*, fe.final_score, fe.selected_grade, fe.self_done, fe.mgr_done
      FROM eval_cycles e
      LEFT JOIN final_evaluations fe ON fe.eval_id = e.id
      WHERE e.user_id=${Number(userId)} AND e.period_label=${periodLabel} AND e.eval_year=${evalYear}
    `;
    return rows;
  }

  // 보고/피드백 카운트 (사용자/기간)
  async getReportFeedbackCount(userId, periodLabel) {
    const uid = Number(userId);
    const rows = await this.prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM progress_reports pr JOIN eval_cycles e ON pr.eval_id=e.id WHERE e.user_id=${uid} AND e.period_label=${periodLabel}) as report_count,
        (SELECT COUNT(*) FROM feedbacks f JOIN eval_cycles e ON f.eval_id=e.id WHERE e.user_id=${uid} AND e.period_label=${periodLabel}) as feedback_count
    `;
    const r = rows[0] || {};
    return { report_count: Number(r.report_count||0), feedback_count: Number(r.feedback_count||0) };
  }

  // OKR KR update
  async updateKrProgress(krId, currentValue) {
    await this.prisma.$executeRaw`
      UPDATE okr_key_results SET current_value=${currentValue} WHERE id=${Number(krId)}
    `;
  }

  // ── perf/* 공유 헬퍼 async 버전 (INFRA-A6) ──────────────

  async getLeaderOrgIds(userId) {
    const rows = await this.prisma.$queryRaw`
      WITH RECURSIVE t AS (
        SELECT id FROM organizations WHERE leader_id=${Number(userId)} AND is_active=1
        UNION ALL
        SELECT o.id FROM organizations o INNER JOIN t ON o.parent_id=t.id WHERE o.is_active=1
      ) SELECT id FROM t
    `;
    return this._toNum(rows).map(r => r.id);
  }

  async getSubtreeUserIds(orgId) {
    const rows = await this.prisma.$queryRaw`
      WITH RECURSIVE t AS (
        SELECT id FROM organizations WHERE id=${Number(orgId)} AND is_active=1
        UNION ALL
        SELECT o.id FROM organizations o INNER JOIN t ON o.parent_id=t.id WHERE o.is_active=1
      ) SELECT u.id FROM users u INNER JOIN t ON u.org_id=t.id WHERE u.is_active=1
    `;
    return this._toNum(rows).map(r => r.id);
  }

  async calcGradeStats(userIds, periodLabels, { maxScore, scoreToGrade }) {
    const empty = { total: userIds.length, evaluated: 0, avg_score: null, avg_grade: null, dist: {}, avg_score_max: maxScore };
    if (!userIds.length || !periodLabels.length) return empty;
    const rows = await this.prisma.$queryRaw`
      SELECT fe.selected_grade, fe.final_score FROM final_evaluations fe
      JOIN eval_cycles ec ON fe.eval_id=ec.id
      WHERE ec.user_id IN (${Prisma.join(userIds)}) AND ec.period_label IN (${Prisma.join(periodLabels)})
        AND fe.selected_grade IS NOT NULL AND fe.selected_grade != 'NC'
    `;
    const dist = {};
    let sum = 0, cnt = 0;
    rows.forEach(r => {
      dist[r.selected_grade] = (dist[r.selected_grade] || 0) + 1;
      if (r.final_score !== null) { sum += r.final_score; cnt++; }
    });
    const avg = cnt > 0 ? Math.round((sum / cnt) * 10000) / 10000 : null;
    return { total: userIds.length, evaluated: rows.length, avg_score: avg, avg_score_max: maxScore, avg_grade: scoreToGrade(avg), dist };
  }

  async calcCompletionStats(directUserIds, periodIds) {
    const totalExpected = directUserIds.length * periodIds.length;
    if (totalExpected === 0) return { completed: 0, total: 0, rate: 0 };
    const rows = await this.prisma.$queryRaw`
      SELECT COUNT(*) as cnt FROM eval_cycles ec
      JOIN final_evaluations fe ON fe.eval_id=ec.id
      JOIN eval_periods ep ON ep.eval_year=ec.eval_year AND ep.period_label=ec.period_label
      WHERE ec.user_id IN (${Prisma.join(directUserIds)}) AND ep.id IN (${Prisma.join(periodIds)})
        AND ec.phase='final_done' AND fe.locked=1
    `;
    const completed = Number(rows[0]?.cnt || 0);
    return { completed, total: totalExpected, rate: Math.round(completed / totalExpected * 100) };
  }

  // perf/org-tree: orgs + leader join
  async findOrgsWithLeader() {
    const rows = await this.prisma.$queryRaw`
      SELECT o.id, o.name, o.parent_id, o.sort_order, u.name as leader_name
      FROM organizations o LEFT JOIN users u ON o.leader_id=u.id
      WHERE o.is_active=1 ORDER BY o.sort_order, o.id
    `;
    return this._toNum(rows);
  }

  // 전체 is_active 사용자 ID 목록
  async findAllActiveUserIds() {
    const rows = await this.prisma.$queryRaw`SELECT id FROM users WHERE is_active=1`;
    return this._toNum(rows).map(r => r.id);
  }

  // 조직 이름 조회
  async findOrgNameById(orgId) {
    const rows = await this.prisma.$queryRaw`
      SELECT name FROM organizations WHERE id=${Number(orgId)} LIMIT 1
    `;
    return rows[0]?.name || null;
  }

  // eval_periods WHERE id IN (...) filtered
  async findPeriodsByIds(ids, activeFilter = false) {
    if (!ids || !ids.length) return [];
    const activeClause = activeFilter ? Prisma.sql`AND is_active=1` : Prisma.empty;
    const rows = await this.prisma.$queryRaw`
      SELECT * FROM eval_periods WHERE id IN (${Prisma.join(ids)}) ${activeClause} ORDER BY eval_year, period_label
    `;
    return this._toNum(rows);
  }

  // grade-policy count (for grade-distribution)
  async findGradePolicyCriteria(policyId) {
    const rows = await this.prisma.$queryRaw`
      SELECT grade_code, min_score, sort_order FROM grade_policy_criteria
      WHERE policy_id=${Number(policyId)} ORDER BY min_score DESC
    `;
    return rows;
  }

  // audit_logs 조회 (동적 action 필터 + limit)
  async getAuditLogs({ action = null, limit = 300 }) {
    const whereClause = action ? Prisma.sql`WHERE a.action=${action}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw`
      SELECT a.id, a.user_id, a.action, a.ip, a.created_at,
             a.target_id, a.target_name, a.detail,
             u.name as actor_name, u.dept as actor_dept
      FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC LIMIT ${Number(limit)}
    `;
    return this._toNum(rows);
  }

  // ── A9b 추가 메서드 ──────────────────────────────────────

  // 최종 점수 계산 (scoreField 화이트리스트 필수 — Prisma.raw 사용)
  async calcFinalScore(evalId, scoreField) {
    const VALID = ['mgr_score', 'self_score', 'second_mgr_score'];
    if (!VALID.includes(scoreField)) throw new Error(`Invalid scoreField: ${scoreField}`);
    const col = Prisma.raw(scoreField); // 화이트리스트 통과 컬럼명만 raw 삽입
    const rows = this._toNum(await this.prisma.$queryRaw`
      SELECT g.weight, g.category_id, fes.${col} AS score
      FROM goals g JOIN final_eval_scores fes ON fes.goal_id = g.id
      WHERE g.eval_id = ${Number(evalId)} AND fes.${col} IS NOT NULL
    `);
    if (!rows.length) return null;
    const catRows = this._toNum(await this.prisma.$queryRaw`
      SELECT id, weight FROM goal_categories WHERE is_active=1
    `);
    const catWeightMap = new Map(catRows.map(c => [c.id, Number(c.weight) || 0]));
    const byCat = new Map();
    for (const r of rows) {
      if (!byCat.has(r.category_id)) byCat.set(r.category_id, []);
      byCat.get(r.category_id).push(r);
    }
    let finalScore = 0, usedCatW = 0;
    for (const [catId, catGoals] of byCat) {
      const catW = catWeightMap.get(catId);
      if (!catW) continue;
      const totalInnerW = catGoals.reduce((a, g) => a + (Number(g.weight) || 0), 0) || 1;
      const catScore = catGoals.reduce(
        (a, g) => a + (Number(g.score) / 5 * 100) * (Number(g.weight) / totalInnerW), 0
      );
      finalScore += catScore * (catW / 100);
      usedCatW += catW;
    }
    if (usedCatW > 0 && usedCatW < 100) finalScore = finalScore * (100 / usedCatW);
    return Math.round(finalScore * 100) / 100;
  }

  // 사용자가 팀원을 가지는지 (isManager 체크)
  async hasDirectReports(userId) {
    const u = await this.prisma.user.findFirst({
      where: { managerId: Number(userId) },
      select: { id: true },
    });
    return !!u;
  }

  // 진행 중 평가 존재 여부 (final_done 제외)
  async hasActiveEval(userId) {
    const ev = await this.prisma.evalCycle.findFirst({
      where: { userId: Number(userId), NOT: { phase: 'final_done' } },
      select: { id: true },
    });
    return !!ev;
  }

  // 사용자 eval_mode 업데이트
  async updateUserEvalMode(userId, mode) {
    await this.prisma.user.update({
      where: { id: Number(userId) },
      data: { evalMode: mode },
    });
  }

  // app_settings 단일 값 조회
  async getAppSettingValue(key) {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  // app_settings upsert (단순 key/value — eval_mode 등)
  async setAppSettingDirect(key, value) {
    await this.prisma.appSetting.upsert({
      where:  { key },
      update: { value },
      create: { key, value },
    });
  }

  // app_settings 전체 행 반환 (value + updated_by + updated_at)
  async getSettingRow(key) {
    const row = await this.prisma.appSetting.findUnique({
      where: { key },
      select: { value: true, updatedBy: true, updatedAt: true },
    });
    if (!row) return null;
    return { value: row.value, updated_by: row.updatedBy, updated_at: row.updatedAt };
  }

  // app_settings upsert (updated_by + updated_at 포함 — notice/session-policy 등)
  async upsertSettingMeta(key, value, userId) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await this.prisma.appSetting.upsert({
      where:  { key },
      update: { value, updatedBy: userId ? Number(userId) : null, updatedAt: now },
      create: { key, value, updatedBy: userId ? Number(userId) : null, updatedAt: now },
    });
  }

  // 사용자 이름 조회
  async findUserNameById(userId) {
    const u = await this.prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { name: true },
    });
    return u?.name || null;
  }

  // OKR 전체 사이클 조회 (objectives + key_results 포함)
  async findAllOkrCycles(userId) {
    const cycles = this._toNum(await this.prisma.$queryRaw`
      SELECT * FROM okr_cycles WHERE user_id=${Number(userId)} ORDER BY created_at DESC
    `);
    for (const c of cycles) {
      const objs = this._toNum(await this.prisma.$queryRaw`
        SELECT * FROM okr_objectives WHERE cycle_id=${Number(c.id)} ORDER BY sort_order
      `);
      for (const obj of objs) {
        obj.key_results = this._toNum(await this.prisma.$queryRaw`
          SELECT * FROM okr_key_results WHERE objective_id=${Number(obj.id)} ORDER BY sort_order
        `);
      }
      c.objectives = objs;
    }
    return cycles;
  }

  // OKR 사이클 생성 (objectives + key_results 포함, 원자 처리)
  async createOkrCycleWithDetails(userId, periodLabel, evalYear, objectives) {
    return await this.prisma.$transaction(async (tx) => {
      const cycle = await tx.okrCycle.create({
        data: { userId: Number(userId), periodLabel, evalYear },
      });
      for (let oi = 0; oi < (objectives || []).length; oi++) {
        const obj = objectives[oi];
        const objective = await tx.okrObjective.create({
          data: {
            cycleId:     cycle.id,
            title:       obj.title,
            description: obj.description || '',
            sortOrder:   oi,
          },
        });
        for (let ki = 0; ki < (obj.key_results || []).length; ki++) {
          const kr = obj.key_results[ki];
          await tx.okrKeyResult.create({
            data: {
              objectiveId: objective.id,
              title:       kr.title,
              targetValue: kr.target_value || 100,
              unit:        kr.unit || '%',
              weight:      kr.weight || 33,
              sortOrder:   ki,
            },
          });
        }
      }
      return cycle.id;
    });
  }

  // RF-VIEW-1: 조직 목록 중 하위 조직이 하나라도 있는지 (팀장 vs 본부장 판정용)
  async hasChildOrgs(orgIds) {
    if (!orgIds.length) return false;
    const rows = await this.prisma.$queryRaw`
      SELECT 1 FROM organizations WHERE parent_id IN (${Prisma.join(orgIds)}) AND is_active=1 LIMIT 1
    `;
    return rows.length > 0;
  }

  // RF-VIEW-1: 특정 기간 특정 사용자들의 eval 목록 (보고/피드백 포함)
  async findEvalsByUsersAndPeriod(userIds, periodLabel) {
    if (!userIds.length) return [];
    const rows = await this.prisma.$queryRaw`
      SELECT ec.id, ec.user_id, ec.period_label, ec.eval_year, ec.phase,
             u.name AS user_name, u.dept, u.title
      FROM eval_cycles ec
      JOIN users u ON u.id = ec.user_id
      WHERE ec.user_id IN (${Prisma.join(userIds)})
        AND ec.period_label = ${periodLabel}
        AND ec.phase IN ('approved','final_self','final_mgr_pending','final_mgr2_pending','final_done')
      ORDER BY u.name
    `;
    return this._toNum(rows);
  }

  // grade-distribution count by grade
  async countByGrade(userIds, periodLabel, grade) {
    if (!userIds.length) return 0;
    const rows = await this.prisma.$queryRaw`
      SELECT COUNT(*) as c FROM final_evaluations fe
      JOIN eval_cycles ec ON fe.eval_id=ec.id
      WHERE ec.user_id IN (${Prisma.join(userIds)}) AND ec.period_label=${periodLabel} AND fe.selected_grade=${grade}
    `;
    return Number(rows[0]?.c || 0);
  }
}

module.exports = PrismaAdminRepository;
