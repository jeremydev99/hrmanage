const GradePolicyRepository = require('../../repositories/GradePolicyRepository');
const { _toStr } = require('./_helpers');

class PrismaGradePolicyRepository extends GradePolicyRepository {
  constructor(prismaClient) {
    super();
    if (!prismaClient) throw new Error('PrismaGradePolicyRepository requires a prismaClient instance');
    this.prisma = prismaClient;
  }

  _flattenPolicy(p) {
    return {
      id:          p.id,
      name:        p.name,
      description: p.description,
      created_at:  _toStr(p.created_at),
      created_by:  p.createdBy,
    };
  }

  _flattenCriteria(c) {
    return {
      id:          c.id,
      grade_code:  c.gradeCode,
      grade_name:  c.gradeName,
      min_score:   c.minScore,
      sort_order:  c.sortOrder,
      description: c.description,
      note:        c.note,
    };
  }

  _flattenPeriod(ep) {
    return {
      id:           ep.id,
      eval_year:    ep.evalYear,
      period_label: ep.periodLabel,
      is_active:    ep.isActive,
    };
  }

  async findAll() {
    const policies = await this.prisma.gradePolicy.findMany({
      orderBy: { id: 'asc' },
      include: {
        criteria: { orderBy: { sortOrder: 'asc' } },
        evalPeriods: {
          select: { id: true, evalYear: true, periodLabel: true, isActive: true },
          orderBy: [{ evalYear: 'desc' }, { id: 'desc' }],
        },
      },
    });
    return policies.map(p => ({
      ...this._flattenPolicy(p),
      criteria:        p.criteria.map(c => this._flattenCriteria(c)),
      applied_periods: p.evalPeriods.map(ep => this._flattenPeriod(ep)),
    }));
  }

  async findById(id) {
    const p = await this.prisma.gradePolicy.findUnique({ where: { id: Number(id) } });
    return p ? this._flattenPolicy(p) : null;
  }

  async findByName(name) {
    const p = await this.prisma.gradePolicy.findFirst({ where: { name } });
    return p ? { id: p.id } : null;
  }

  async findByNameExcluding(name, excludeId) {
    const p = await this.prisma.gradePolicy.findFirst({
      where: { name, NOT: { id: Number(excludeId) } },
    });
    return p ? { id: p.id } : null;
  }

  async getAppliedCount(policyId) {
    return await this.prisma.evalPeriod.count({ where: { gradePolicyId: Number(policyId) } });
  }

  async getAppliedPeriods(policyId) {
    const periods = await this.prisma.evalPeriod.findMany({
      where: { gradePolicyId: Number(policyId) },
      select: { id: true, evalYear: true, periodLabel: true, isActive: true },
      orderBy: [{ evalYear: 'desc' }, { id: 'desc' }],
    });
    return periods.map(ep => this._flattenPeriod(ep));
  }

  // TX1: 정책 + criteria 일괄 생성 (원자 처리)
  async createWithCriteria(policyData, criteria) {
    return await this.prisma.$transaction(async (tx) => {
      const policy = await tx.gradePolicy.create({
        data: {
          name:        policyData.name,
          description: policyData.description || null,
          createdBy:   policyData.created_by  || null,
        },
      });
      for (const c of criteria) {
        await tx.gradePolicyCriteria.create({
          data: {
            policyId:    policy.id,
            gradeCode:   c.grade_code.trim(),
            gradeName:   c.grade_name.trim(),
            minScore:    c.min_score,
            sortOrder:   c.sort_order,
            description: c.description || null,
            note:        c.note        || null,
          },
        });
      }
      return policy.id;
    });
  }

  // TX2: 정책 메타 수정 + criteria 교체 (잠금가드는 핸들러에서 사전 검사)
  async updateWithCriteria(policyId, metaUpdates, criteria) {
    const pid = Number(policyId);
    await this.prisma.$transaction(async (tx) => {
      if (metaUpdates && Object.keys(metaUpdates).length > 0) {
        const data = {};
        if (metaUpdates.name        !== undefined) data.name        = metaUpdates.name;
        if (metaUpdates.description !== undefined) data.description = metaUpdates.description ?? null;
        await tx.gradePolicy.update({ where: { id: pid }, data });
      }
      if (criteria !== null && criteria !== undefined) {
        await tx.gradePolicyCriteria.deleteMany({ where: { policyId: pid } });
        for (const c of criteria) {
          await tx.gradePolicyCriteria.create({
            data: {
              policyId:    pid,
              gradeCode:   c.grade_code.trim(),
              gradeName:   c.grade_name.trim(),
              minScore:    c.min_score,
              sortOrder:   c.sort_order,
              description: c.description || null,
              note:        c.note        || null,
            },
          });
        }
      }
    });
  }

  // TX3: 바인딩된 eval_periods 초기화 + 정책 삭제 (반환값: 영향받은 기간 목록)
  async deletePolicy(policyId) {
    const pid = Number(policyId);
    return await this.prisma.$transaction(async (tx) => {
      const appliedPeriods = await tx.evalPeriod.findMany({
        where: { gradePolicyId: pid },
        select: { id: true, evalYear: true, periodLabel: true, isActive: true },
      });
      if (appliedPeriods.length > 0) {
        await tx.evalPeriod.updateMany({
          where: { gradePolicyId: pid },
          data:  { gradePolicyId: null, isActive: 0 },
        });
      }
      await tx.gradePolicy.delete({ where: { id: pid } });
      return appliedPeriods.map(ep => this._flattenPeriod(ep));
    });
  }
}

module.exports = PrismaGradePolicyRepository;
