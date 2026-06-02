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
}

module.exports = PrismaAdminRepository;
