/**
 * PrismaAdminRepository — 관리자/perf 분석 복합 쿼리 (INFRA-A6)
 * enc 없음, tx 없음 — 저위험 analytics
 */
class PrismaAdminRepository {
  constructor(prismaClient) {
    if (!prismaClient) throw new Error('PrismaAdminRepository requires prismaClient');
    this.prisma = prismaClient;
  }

  // 전직원 목록 (is_active=1, approved)
  async findActiveUsers() {
    const rows = await this.prisma.$queryRawUnsafe(
      "SELECT id, name, dept, title FROM users WHERE is_active=1 AND (account_status='approved' OR account_status IS NULL) ORDER BY dept, name"
    );
    return this._toNum(rows);
  }

  // BigInt → Number 변환 헬퍼 (Prisma rawUnsafe COUNT(*) 결과)
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
    const ph = periodIds.map(() => '?').join(',');
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT ec.id as eval_id, ec.eval_year, ec.period_label, ec.phase,
             ec.submitted_at, ec.approved_at, ec.locked,
             COALESCE(ep.eval_mode, 'MBO') as eval_mode,
             (SELECT COUNT(*) FROM goals    WHERE eval_id=ec.id) as goal_count,
             (SELECT COUNT(*) FROM feedbacks WHERE eval_id=ec.id) as feedback_count,
             fe.id as final_eval_id, fe.final_score, fe.final_grade
      FROM eval_cycles ec
      LEFT JOIN eval_periods ep ON ep.eval_year=ec.eval_year AND ep.period_label=ec.period_label
                                AND ep.id IN (${ph})
      LEFT JOIN final_evaluations fe ON fe.eval_id=ec.id
      WHERE ec.user_id=? AND ep.id IN (${ph})
      ORDER BY ec.eval_year DESC, ec.period_label DESC
    `, ...periodIds, Number(userId), ...periodIds);
    return this._toNum(rows);
  }

  // 특정 사용자의 최신 eval_cycle (period 선택)
  async findLatestUserEvalForPeriod(userId, periodLabel, evalYear) {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT ec.id, ec.eval_year, ec.period_label, ec.phase,
             COALESCE(ep.eval_mode, 'MBO') as eval_mode
      FROM eval_cycles ec
      LEFT JOIN eval_periods ep ON ep.period_label=ec.period_label AND ep.eval_year=ec.eval_year
      WHERE ec.user_id=?
        AND (ec.period_label=? OR ?='') AND (ec.eval_year=? OR ?='')
      ORDER BY ec.created_at DESC LIMIT 1
    `, Number(userId), periodLabel||'', periodLabel||'', evalYear||'', evalYear||'');
    return rows[0] || null;
  }

  // 특정 eval의 보고·피드백 카운트
  async getEvalCounts(evalId) {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*) FROM progress_reports WHERE eval_id=?) as report_count,
        (SELECT COUNT(*) FROM feedbacks WHERE eval_id=?) as feedback_count
    `, Number(evalId), Number(evalId));
    return rows[0] || { report_count: 0, feedback_count: 0 };
  }

  // OKR 사이클 + objectives + key_results (사용자/기간)
  async findOkrCycleWithDetails(userId, periodLabel, evalYear) {
    const cycles = await this.prisma.$queryRawUnsafe(
      'SELECT * FROM okr_cycles WHERE user_id=? AND period_label=? AND eval_year=?',
      Number(userId), periodLabel, evalYear
    );
    for (const c of cycles) {
      const objs = await this.prisma.$queryRawUnsafe(
        'SELECT * FROM okr_objectives WHERE cycle_id=? ORDER BY sort_order', Number(c.id)
      );
      for (const obj of objs) {
        obj.key_results = await this.prisma.$queryRawUnsafe(
          'SELECT * FROM okr_key_results WHERE objective_id=? ORDER BY sort_order', Number(obj.id)
        );
      }
      c.objectives = objs;
    }
    return cycles;
  }

  // 조직 찾기 (leader_id 기준)
  async findOrgByLeader(leaderId) {
    const rows = await this.prisma.$queryRawUnsafe(
      'SELECT * FROM organizations WHERE leader_id=? AND is_active=1 LIMIT 1', Number(leaderId)
    );
    return rows[0] || null;
  }

  // 조직 하위 멤버 (재귀, 최대 depth)
  async findOrgMembers(orgId, maxDepth = 3) {
    const members = [];
    async function traverse(id, depth) {
      if (depth > maxDepth) return;
      // (this가 없으므로 prisma를 클로저로 캡처)
    }
    // 단순화: 직접 members + sub-orgs 조회 (재귀 대신 iterative)
    const directMembers = await this.prisma.$queryRawUnsafe(
      'SELECT id, name, title FROM users WHERE org_id=? AND is_active=1', Number(orgId)
    );
    const subOrgs = await this.prisma.$queryRawUnsafe(
      'SELECT * FROM organizations WHERE parent_id=? AND is_active=1', Number(orgId)
    );
    members.push(...directMembers);
    for (const sub of subOrgs) {
      const subMembers = await this.findOrgMembers(sub.id, maxDepth - 1);
      members.push(...subMembers);
    }
    return members;
  }

  // eval_cycles + final_evaluations (사용자/기간 기준)
  async findEvalForUserAndPeriod(userId, periodLabel, evalYear) {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT e.*, fe.final_score, fe.selected_grade, fe.self_done, fe.mgr_done
      FROM eval_cycles e
      LEFT JOIN final_evaluations fe ON fe.eval_id = e.id
      WHERE e.user_id=? AND e.period_label=? AND e.eval_year=?
    `, Number(userId), periodLabel, evalYear);
    return rows;
  }

  // 보고/피드백 카운트 (사용자/기간)
  async getReportFeedbackCount(userId, periodLabel) {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*) FROM progress_reports pr JOIN eval_cycles e ON pr.eval_id=e.id WHERE e.user_id=? AND e.period_label=?) as report_count,
        (SELECT COUNT(*) FROM feedbacks f JOIN eval_cycles e ON f.eval_id=e.id WHERE e.user_id=? AND e.period_label=?) as feedback_count
    `, Number(userId), periodLabel, Number(userId), periodLabel);
    const r = rows[0] || {};
    return { report_count: Number(r.report_count||0), feedback_count: Number(r.feedback_count||0) };
  }

  // OKR KR update
  async updateKrProgress(krId, currentValue) {
    await this.prisma.$queryRawUnsafe(
      'UPDATE okr_key_results SET current_value=? WHERE id=?', currentValue, Number(krId)
    );
  }

  // ── perf/* 공유 헬퍼 async 버전 (INFRA-A6) ──────────────

  async getLeaderOrgIds(userId) {
    const rows = await this.prisma.$queryRawUnsafe(`
      WITH RECURSIVE t AS (
        SELECT id FROM organizations WHERE leader_id=? AND is_active=1
        UNION ALL
        SELECT o.id FROM organizations o INNER JOIN t ON o.parent_id=t.id WHERE o.is_active=1
      ) SELECT id FROM t
    `, Number(userId));
    return this._toNum(rows).map(r => r.id);
  }

  async getSubtreeUserIds(orgId) {
    const rows = await this.prisma.$queryRawUnsafe(`
      WITH RECURSIVE t AS (
        SELECT id FROM organizations WHERE id=? AND is_active=1
        UNION ALL
        SELECT o.id FROM organizations o INNER JOIN t ON o.parent_id=t.id WHERE o.is_active=1
      ) SELECT u.id FROM users u INNER JOIN t ON u.org_id=t.id WHERE u.is_active=1
    `, Number(orgId));
    return this._toNum(rows).map(r => r.id);
  }

  async calcGradeStats(userIds, periodLabels, { maxScore, scoreToGrade }) {
    const empty = { total: userIds.length, evaluated: 0, avg_score: null, avg_grade: null, dist: {}, avg_score_max: maxScore };
    if (!userIds.length || !periodLabels.length) return empty;
    const uPh = userIds.map(() => '?').join(',');
    const pPh = periodLabels.map(() => '?').join(',');
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT fe.selected_grade, fe.final_score FROM final_evaluations fe
      JOIN eval_cycles ec ON fe.eval_id=ec.id
      WHERE ec.user_id IN (${uPh}) AND ec.period_label IN (${pPh})
        AND fe.selected_grade IS NOT NULL AND fe.selected_grade != 'NC'
    `, ...userIds, ...periodLabels);
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
    const uPh = directUserIds.map(() => '?').join(',');
    const pPh = periodIds.map(() => '?').join(',');
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt FROM eval_cycles ec
      JOIN final_evaluations fe ON fe.eval_id=ec.id
      JOIN eval_periods ep ON ep.eval_year=ec.eval_year AND ep.period_label=ec.period_label
      WHERE ec.user_id IN (${uPh}) AND ep.id IN (${pPh})
        AND ec.phase='final_done' AND fe.locked=1
    `, ...directUserIds, ...periodIds);
    const completed = Number(rows[0]?.cnt || 0);
    return { completed, total: totalExpected, rate: Math.round(completed / totalExpected * 100) };
  }

  // perf/org-tree: orgs + leader join
  async findOrgsWithLeader() {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT o.id, o.name, o.parent_id, o.sort_order, u.name as leader_name
      FROM organizations o LEFT JOIN users u ON o.leader_id=u.id
      WHERE o.is_active=1 ORDER BY o.sort_order, o.id
    `);
    return this._toNum(rows);
  }

  // 전체 is_active 사용자 ID 목록
  async findAllActiveUserIds() {
    const rows = await this.prisma.$queryRawUnsafe('SELECT id FROM users WHERE is_active=1');
    return this._toNum(rows).map(r => r.id);
  }

  // 조직 이름 조회
  async findOrgNameById(orgId) {
    const rows = await this.prisma.$queryRawUnsafe('SELECT name FROM organizations WHERE id=? LIMIT 1', Number(orgId));
    return rows[0]?.name || null;
  }

  // eval_periods WHERE id IN (...) filtered
  async findPeriodsByIds(ids, activeFilter = false) {
    if (!ids || !ids.length) return [];
    const ph = ids.map(() => '?').join(',');
    const whereExtra = activeFilter ? 'AND is_active=1' : '';
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM eval_periods WHERE id IN (${ph}) ${whereExtra} ORDER BY eval_year, period_label`,
      ...ids
    );
    return this._toNum(rows);
  }

  // grade-policy count (for grade-distribution)
  async findGradePolicyCriteria(policyId) {
    const rows = await this.prisma.$queryRawUnsafe(
      'SELECT grade_code, min_score, sort_order FROM grade_policy_criteria WHERE policy_id=? ORDER BY min_score DESC',
      Number(policyId)
    );
    return rows;
  }

  // audit_logs 조회 (동적 action 필터 + limit)
  async getAuditLogs({ action = null, limit = 300 }) {
    const params = [];
    const where = action ? 'WHERE a.action=?' : '';
    if (action) params.push(action);
    params.push(Number(limit));
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT a.id, a.user_id, a.action, a.ip, a.created_at,
             a.target_id, a.target_name, a.detail,
             u.name as actor_name, u.dept as actor_dept
      FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
      ${where}
      ORDER BY a.created_at DESC LIMIT ?
    `, ...params);
    return this._toNum(rows);
  }

  // grade-distribution count by grade
  async countByGrade(userIds, periodLabel, grade) {
    if (!userIds.length) return 0;
    const ph = userIds.map(() => '?').join(',');
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as c FROM final_evaluations fe
      JOIN eval_cycles ec ON fe.eval_id=ec.id
      WHERE ec.user_id IN (${ph}) AND ec.period_label=? AND fe.selected_grade=?
    `, ...userIds, periodLabel, grade);
    return Number(rows[0]?.c || 0);
  }
}

module.exports = PrismaAdminRepository;
