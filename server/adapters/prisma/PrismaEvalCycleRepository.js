const EvalCycleRepository = require('../../repositories/EvalCycleRepository');
const crypto = require('crypto');
const { _toStr } = require('./_helpers');

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

  // 명시적 매핑 — SQLite(snake_case 필드) / PostgreSQL(camelCase 필드) 양쪽 호환
  _flatten(ev) {
    if (!ev) return null;
    return {
      id:            ev.id,
      user_id:       ev.userId,
      period_type:   ev.periodType,
      period_label:  ev.periodLabel,
      eval_year:     ev.evalYear,
      phase:         ev.phase,
      locked:        ev.locked,
      phase2:        ev.phase2,
      self_reason:   ev.selfReason   ? this._decrypt(ev.selfReason)   : '',
      reject_reason: ev.rejectReason ? this._decrypt(ev.rejectReason) : '',
      submitted_at:  _toStr(ev.submittedAt ?? ev.submitted_at),
      approved_at:   _toStr(ev.approvedAt  ?? ev.approved_at),
      created_at:    _toStr(ev.createdAt   ?? ev.created_at),
      updated_at:    _toStr(ev.updatedAt   ?? ev.updated_at),
      user_name:     ev.user?.name || null,
      dept:          ev.user?.dept || null,
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
      updated_at: new Date().toISOString(),
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
        updated_at:   new Date().toISOString(),
      }
    });
  }

  async updatePhaseAndLocked(id, phase, locked) {
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: {
        phase,
        locked:     Number(locked),
        updated_at: new Date().toISOString(),
      }
    });
  }

  // approvals 도메인용 phase 전환 메서드 (INFRA-A4)
  async findAllByUser(userId) {
    const evs = await this.prisma.evalCycle.findMany({
      where: { userId: Number(userId) },
      orderBy: { created_at: 'desc' },
    });
    return evs.map(e => this._flatten(e));
  }

  async setApproved(id) {
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: { phase: 'approved', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    });
  }

  async setRejected(id, rejectReasonPlain) {
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: {
        phase:        'rejected',
        rejectReason: this._encrypt(rejectReasonPlain || ''),
        updated_at:   new Date().toISOString(),
      }
    });
  }

  async setToPending(id) {
    await this.prisma.evalCycle.update({
      where: { id: Number(id) },
      data: { phase: 'pending', approved_at: null, updated_at: new Date().toISOString() }
    });
  }

  async findPendingWithUser() {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT e.*, u.name as user_name, u.dept, u.title, u.manager_id
      FROM eval_cycles e JOIN users u ON e.user_id = u.id
      WHERE e.phase='pending'
    `);
    return rows;
  }
}

module.exports = PrismaEvalCycleRepository;
