/**
 * PrismaGoalApprovalRepository — goal_approvals 테이블 Aggregate
 * enc 필드: note (AES-256-CBC, _flatten 경유)
 */
const crypto = require('crypto');
const { _toStr } = require('./_helpers');

class PrismaGoalApprovalRepository {
  constructor(prismaClient, encSecret) {
    if (!prismaClient) throw new Error('PrismaGoalApprovalRepository requires prismaClient');
    if (!encSecret)    throw new Error('PrismaGoalApprovalRepository requires encSecret');
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

  _flatten(a) {
    if (!a) return null;
    return {
      id:             a.id,
      eval_id:        a.evalId,
      approver_id:    a.approverId,
      level:          a.level,
      action:         a.action,
      note:           a.note ? this._decrypt(a.note) : '',
      created_at:     _toStr(a.createdAt ?? a.created_at),
      approver_name:  a.approver?.name  || null,
      approver_title: a.approver?.title || null,
    };
  }

  async findById(id) {
    const a = await this.prisma.goalApproval.findUnique({ where: { id: Number(id) } });
    if (!a) return null;
    return { ...this._flatten(a), _raw_note: a.note };
  }

  async findByEvalId(evalId) {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT a.id, a.eval_id, a.approver_id, a.level, a.action, a.note, a.created_at,
             u.name as approver_name, u.title as approver_title
      FROM goal_approvals a LEFT JOIN users u ON a.approver_id = u.id
      WHERE a.eval_id = ? ORDER BY a.created_at ASC
    `, Number(evalId));
    return rows.map(a => ({
      id: a.id, eval_id: a.eval_id, approver_id: a.approver_id,
      level: a.level, action: a.action,
      note: a.note ? this._decrypt(a.note) : '',
      created_at: a.created_at,
      approver_name: a.approver_name || null,
      approver_title: a.approver_title || null,
    }));
  }

  async findByEvalIdOrdered(evalId) {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT a.id, a.eval_id, a.approver_id, a.level, a.action, a.note, a.created_at,
             u.name as approver_name, u.title as approver_title
      FROM goal_approvals a LEFT JOIN users u ON a.approver_id = u.id
      WHERE a.eval_id = ? ORDER BY a.level ASC
    `, Number(evalId));
    return rows.map(a => ({
      id: a.id, eval_id: a.eval_id, approver_id: a.approver_id,
      level: a.level, action: a.action,
      note: a.note ? this._decrypt(a.note) : '',
      created_at: a.created_at,
      approver_name: a.approver_name || null,
      approver_title: a.approver_title || null,
    }));
  }

  async findByEvalIdAndLevel(evalId, level) {
    return await this.prisma.goalApproval.findFirst({
      where: { evalId: Number(evalId), level: Number(level) },
    });
  }

  async countApprovedByEval(evalId) {
    return await this.prisma.goalApproval.count({
      where: { evalId: Number(evalId), action: 'approved' },
    });
  }

  async create({ eval_id, approver_id, level, action, note }) {
    const a = await this.prisma.goalApproval.create({
      data: {
        evalId:     Number(eval_id),
        approverId: Number(approver_id),
        level:      level !== undefined ? Number(level) : null,
        action:     action || null,
        note:       note !== undefined ? this._encrypt(note) : null,
      },
    });
    return a.id;
  }

  async updateNote(id, note) {
    await this.prisma.goalApproval.update({
      where: { id: Number(id) },
      data:  { note: this._encrypt(note || '') },
    });
  }

  async deleteById(id) {
    await this.prisma.goalApproval.delete({ where: { id: Number(id) } });
  }

  async deleteByEvalId(evalId) {
    await this.prisma.goalApproval.deleteMany({ where: { evalId: Number(evalId) } });
  }

  // 복잡 조회: 내 승인 이력 (동적 필터)
  async findHistoryByApprover(approverId, { periodLabel, evalYear } = {}) {
    let sql = `
      SELECT a.id, a.eval_id, a.approver_id, a.level, a.action, a.note, a.created_at,
             e.user_id, e.period_label, e.eval_year, e.phase,
             u.name as target_name, u.dept as target_dept, u.title as target_title, u.grade as target_grade
      FROM goal_approvals a
      JOIN eval_cycles e ON a.eval_id = e.id
      JOIN users u ON e.user_id = u.id
      WHERE a.approver_id = ?`;
    const params = [Number(approverId)];
    if (periodLabel) { sql += ' AND e.period_label=?'; params.push(periodLabel); }
    if (evalYear)    { sql += ' AND e.eval_year=?';    params.push(evalYear); }
    sql += ' ORDER BY a.created_at DESC';
    const rows = await this.prisma.$queryRawUnsafe(sql, ...params);
    return rows.map(r => ({ ...r, note: r.note ? this._decrypt(r.note) : '' }));
  }

  // pending 조회: phase='pending' eval 목록 (user join)
  async findPendingEvals() {
    const rows = await this.prisma.$queryRawUnsafe(`
      SELECT e.*, u.name as user_name, u.dept, u.title, u.manager_id
      FROM eval_cycles e JOIN users u ON e.user_id = u.id
      WHERE e.phase='pending'
    `);
    return rows;
  }
}

module.exports = PrismaGoalApprovalRepository;
