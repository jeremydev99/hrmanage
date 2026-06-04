/**
 * PrismaEvalPeriodRepository — eval_periods 테이블 CRUD (INFRA-A6)
 * enc 필드 없음, tx 없음 — 저위험
 */
const { Prisma } = require('@prisma/client');
const { _toStr } = require('./_helpers');

class PrismaEvalPeriodRepository {
  constructor(prismaClient) {
    if (!prismaClient) throw new Error('PrismaEvalPeriodRepository requires prismaClient');
    this.prisma = prismaClient;
  }

  _flatten(p) {
    if (!p) return null;
    return {
      id:                   p.id,
      period_type:          p.periodType,
      period_label:         p.periodLabel,
      eval_year:            p.evalYear,
      is_active:            p.isActive,
      created_by:           p.created_by,
      created_at:           _toStr(p.createdAt ?? p.created_at),
      eval_mode:            p.evalMode,
      locked:               p.locked,
      grade_policy_id:      p.gradePolicyId,
      activation_blocked_at: p.activationBlockedAt,
    };
  }

  async findAll({ yearFrom, yearTo, includeInactive } = {}) {
    const where = {};
    if (!includeInactive) where.isActive = 1;
    const rows = await this.prisma.evalPeriod.findMany({
      where,
      orderBy: [{ evalYear: 'asc' }, { periodLabel: 'asc' }],
    });
    // yearFrom/yearTo 필터 (eval_year는 "2025년" 형식 문자열)
    return rows.map(this._flatten).filter(p => {
      if (!yearFrom && !yearTo) return true;
      const year = parseInt((p.eval_year || '').match(/(\d{4})/)?.[1] || 0);
      if (yearFrom && year < yearFrom) return false;
      if (yearTo   && year > yearTo)   return false;
      return true;
    });
  }

  async findActive() {
    const rows = await this.prisma.evalPeriod.findMany({
      where: { isActive: 1 },
      orderBy: { id: 'desc' },
    });
    return rows.map(r => this._flatten(r));
  }

  async findAvailableYears({ includeInactive } = {}) {
    const where = includeInactive ? {} : { isActive: 1 };
    const rows = await this.prisma.evalPeriod.findMany({
      where,
      select: { evalYear: true },
      distinct: ['evalYear'],
      orderBy: { evalYear: 'desc' },
    });
    return rows.map(r => r.evalYear);
  }

  async findById(id) {
    const p = await this.prisma.evalPeriod.findUnique({ where: { id: Number(id) } });
    return this._flatten(p);
  }

  async findByLabelAndYear(periodLabel, evalYear) {
    const p = await this.prisma.evalPeriod.findFirst({ where: { periodLabel, evalYear } });
    return this._flatten(p);
  }

  async findMissingPolicy() {
    const rows = await this.prisma.evalPeriod.findMany({
      where: {
        gradePolicyId:        null,
        activationBlockedAt:  { not: null },
      },
      orderBy: { activationBlockedAt: 'desc' },
    });
    return rows.map(r => this._flatten(r));
  }

  async create({ period_type, period_label, eval_year, is_active, created_by, grade_policy_id }) {
    const r = await this.prisma.evalPeriod.create({
      data: {
        periodType:   period_type,
        periodLabel:  period_label,
        evalYear:     eval_year,
        isActive:     is_active ?? 1,
        created_by,
        gradePolicyId: grade_policy_id || null,
      },
    });
    return r.id;
  }

  async update(id, data) {
    const updateData = {};
    if (data.grade_policy_id !== undefined) {
      updateData.gradePolicyId = data.grade_policy_id || null;
      if (data.grade_policy_id) updateData.activationBlockedAt = null;
    }
    if (Object.keys(updateData).length === 0) return;
    await this.prisma.evalPeriod.update({ where: { id: Number(id) }, data: updateData });
  }

  async toggle(id) {
    const p = await this.prisma.evalPeriod.findUnique({ where: { id: Number(id) } });
    if (!p) return null;
    const next = p.isActive ? 0 : 1;
    const updateData = { isActive: next };
    if (next === 0 && !p.gradePolicyId) {
      updateData.activationBlockedAt = new Date().toISOString();
    } else if (next === 1 && p.gradePolicyId) {
      updateData.activationBlockedAt = null;
    }
    await this.prisma.evalPeriod.update({ where: { id: Number(id) }, data: updateData });
    return { success: true, is_active: next, blocked: next === 0 && !p.gradePolicyId };
  }

  async delete(id) {
    await this.prisma.evalPeriod.delete({ where: { id: Number(id) } });
  }

  async setEvalMode(id, evalMode) {
    await this.prisma.evalPeriod.update({ where: { id: Number(id) }, data: { evalMode } });
  }

  async lock(id) {
    await this.prisma.evalPeriod.update({ where: { id: Number(id) }, data: { locked: 1 } });
  }

  async findOrgModes(periodId) {
    const rows = await this.prisma.$queryRaw`
      SELECT em.manager_id, em.eval_mode, em.locked,
             u.name as leader_name, o.name as org_name
      FROM eval_period_modes em
      JOIN users u ON u.id = em.manager_id
      LEFT JOIN organizations o ON o.leader_id = em.manager_id AND o.is_active = 1
      WHERE em.period_id = ${Number(periodId)}
      ORDER BY u.name
    `;
    return rows;
  }

  async setOrgMode(periodId, managerId, evalMode) {
    await this.prisma.$executeRaw`
      INSERT INTO eval_period_modes(period_id, manager_id, eval_mode)
      VALUES(${Number(periodId)}, ${Number(managerId)}, ${evalMode})
      ON CONFLICT(period_id, manager_id) DO UPDATE SET eval_mode = excluded.eval_mode
    `;
  }

  async validateGradePolicy(id) {
    const p = await this.prisma.gradePolicy.findUnique({ where: { id: Number(id) } });
    return !!p;
  }

  async checkInUse(periodLabel, evalYear) {
    const rows = await this.prisma.$queryRaw`
      SELECT 1 FROM eval_cycles WHERE period_label=${periodLabel} AND eval_year=${evalYear} LIMIT 1
    `;
    return rows.length > 0;
  }

  async deleteModes(periodId) {
    await this.prisma.$executeRaw`DELETE FROM eval_period_modes WHERE period_id=${Number(periodId)}`;
  }

  async getOrgModeForManager(periodId, managerId) {
    const rows = await this.prisma.$queryRaw`
      SELECT locked FROM eval_period_modes
      WHERE period_id=${Number(periodId)} AND manager_id=${Number(managerId)} LIMIT 1
    `;
    return rows[0] || null;
  }

  async lockOrgMode(periodId) {
    await this.prisma.$executeRaw`
      UPDATE eval_period_modes SET locked=1 WHERE period_id=${Number(periodId)}
    `;
    await this.prisma.evalPeriod.update({ where: { id: Number(periodId) }, data: { locked: 1 } });
  }

  async findMyModes(userId) {
    const rows = await this.prisma.$queryRaw`
      SELECT em.period_id, em.eval_mode, em.locked,
             ep.period_label, ep.eval_year, ep.is_active
      FROM eval_period_modes em
      JOIN eval_periods ep ON ep.id = em.period_id
      WHERE em.manager_id = ${Number(userId)} AND ep.is_active = 1
    `;
    return rows;
  }
}

module.exports = PrismaEvalPeriodRepository;
