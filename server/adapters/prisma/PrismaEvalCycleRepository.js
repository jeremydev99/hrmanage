const EvalCycleRepository = require('../../repositories/EvalCycleRepository');
const crypto = require('crypto');

/**
 * Prisma 기반 EvalCycleRepository 구현체
 * 암호화: self_reason, reject_reason 필드 자동 처리
 * JOIN: User 관계 include로 user_name, dept 포함
 */
class PrismaEvalCycleRepository extends EvalCycleRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) throw new Error('PrismaEvalCycleRepository requires a prismaClient instance');
    if (!encSecret)    throw new Error('PrismaEvalCycleRepository requires encSecret for encryption');
    this.prisma = prismaClient;
    this.encSecret = encSecret;
  }

  _encrypt(text) {
    if (!text) return '';
    const iv  = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encSecret, 'salt', 32);
    const c   = crypto.createCipheriv('aes-256-cbc', key, iv);
    const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
  }

  _decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
      const [ivHex, encHex] = text.split(':');
      const key = crypto.scryptSync(this.encSecret, 'salt', 32);
      const d   = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
      return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
    } catch { return '[복호화 오류]'; }
  }

  _flatten(ev) {
    if (!ev) return null;
    const { user, userId, periodType, periodLabel, evalYear, selfReason, rejectReason, ...rest } = ev;
    return {
      ...rest,
      user_id:       userId,
      period_type:   periodType,
      period_label:  periodLabel,
      eval_year:     evalYear,
      self_reason:   selfReason   ? this._decrypt(selfReason)   : '',
      reject_reason: rejectReason ? this._decrypt(rejectReason) : '',
      user_name:     user?.name || null,
      dept:          user?.dept || null,
    };
  }

  async findById(id) {
    const ev = await this.prisma.evalCycle.findUnique({
      where: { id: Number(id) },
      include: { user: { select: { name: true, dept: true } } }
    });
    return this._flatten(ev);
  }

  async findList({ userId, scope }) {
    let where = {};
    if (scope === 'mine' && userId) {
      where = {
        OR: [
          { userId: Number(userId) },
          { user: { managerId: Number(userId) } }
        ]
      };
    }
    const evs = await this.prisma.evalCycle.findMany({
      where,
      include: { user: { select: { name: true, dept: true } } },
      orderBy: { created_at: 'desc' }
    });
    return evs.map(e => this._flatten(e));
  }

  async findDraftByUserId(userId) {
    const ev = await this.prisma.evalCycle.findFirst({
      where: { userId: Number(userId), phase: 'draft' },
      orderBy: { created_at: 'desc' }
    });
    return ev ? { id: ev.id } : null;
  }

  async create(data) {
    const created = await this.prisma.evalCycle.create({
      data: {
        userId:      Number(data.user_id),
        periodType:  data.period_type,
        periodLabel: data.period_label,
        evalYear:    data.eval_year,
      }
    });
    return created.id;
  }

  async updatePhaseAndReason(id, data) {
    const updateData = {
      phase:      data.phase,
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    if (data.self_reason !== undefined) {
      updateData.selfReason = this._encrypt(data.self_reason || '');
    }
    if (data.submitted_at !== undefined) {
      updateData.submitted_at = data.submitted_at;
    }
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: updateData,
    });
  }

  async reopen(id) {
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: {
        phase:        'draft',
        rejectReason: null,
        updated_at:   new Date().toISOString().slice(0, 19).replace('T', ' '),
      }
    });
  }

  async updatePhaseAndLocked(id, phase, locked) {
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: {
        phase,
        locked:     Number(locked),
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }
    });
  }
}

module.exports = PrismaEvalCycleRepository;
