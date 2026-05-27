const FinalEvaluationRepository = require('../../repositories/FinalEvaluationRepository');
const crypto = require('crypto');
const { _toStr } = require('./_helpers');

class PrismaFinalEvaluationRepository extends FinalEvaluationRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaFinalEvaluationRepository requires a prismaClient');
    }
    if (!encSecret) {
      throw new Error('PrismaFinalEvaluationRepository requires encSecret');
    }
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
  _flatten(fe) {
    if (!fe) return null;
    return {
      id:                    fe.id,
      eval_id:               fe.evalId,
      self_note:             fe.selfNote ? this._decrypt(fe.selfNote) : '',
      self_done:             fe.selfDone,
      self_done_at:          _toStr(fe.selfDoneAt ?? fe.self_done_at),
      mgr_note:              fe.mgrNote ? this._decrypt(fe.mgrNote) : '',
      mgr_done:              fe.mgrDone,
      mgr_done_at:           _toStr(fe.mgrDoneAt ?? fe.mgr_done_at),
      mgr_approver_id:       fe.mgrApproverId,
      final_score:           fe.finalScore,
      final_grade:           fe.finalGrade,
      locked:                fe.locked,
      locked_at:             _toStr(fe.lockedAt ?? fe.locked_at),
      created_at:            _toStr(fe.createdAt ?? fe.created_at),
      updated_at:            _toStr(fe.updatedAt ?? fe.updated_at),
      second_mgr_done:       fe.secondMgrDone,
      second_mgr_done_at:    _toStr(fe.secondMgrDoneAt ?? fe.second_mgr_done_at),
      second_mgr_note:       fe.secondMgrNote ? this._decrypt(fe.secondMgrNote) : '',
      second_mgr_id:         fe.secondMgrId,
      selected_grade:        fe.selectedGrade,
      second_selected_grade: fe.secondSelectedGrade ?? fe.second_selected_grade,
      scores:                (fe.scores || []).map(s => this._flattenScore(s)),
    };
  }

  _flattenScore(s) {
    if (!s) return null;
    return {
      id:               s.id,
      final_id:         s.finalId,
      goal_id:          s.goalId,
      self_score:       s.selfScore,
      mgr_score:        s.mgrScore,
      second_mgr_score: s.secondMgrScore,
      created_at:       _toStr(s.createdAt ?? s.created_at),
    };
  }

  async findByEvalId(evalId) {
    const fe = await this.prisma.finalEvaluation.findUnique({
      where: { evalId: Number(evalId) },
      include: { scores: true }
    });
    return this._flatten(fe);
  }

  async upsert(evalId, data) {
    const updateData = {};
    if (data.self_note !== undefined) updateData.selfNote = this._encrypt(data.self_note || '');
    if (data.self_done !== undefined) updateData.selfDone = Number(data.self_done);
    if (data.self_done_at !== undefined) updateData.self_done_at = data.self_done_at;
    if (data.mgr_note !== undefined) updateData.mgrNote = this._encrypt(data.mgr_note || '');
    if (data.mgr_done !== undefined) updateData.mgrDone = Number(data.mgr_done);
    if (data.mgr_done_at !== undefined) updateData.mgr_done_at = data.mgr_done_at;
    if (data.mgr_approver_id !== undefined) updateData.mgrApproverId = data.mgr_approver_id ? Number(data.mgr_approver_id) : null;
    if (data.second_mgr_note !== undefined) updateData.secondMgrNote = this._encrypt(data.second_mgr_note || '');
    if (data.second_mgr_done !== undefined) updateData.secondMgrDone = Number(data.second_mgr_done);
    if (data.second_mgr_done_at !== undefined) updateData.second_mgr_done_at = data.second_mgr_done_at;
    if (data.second_mgr_id !== undefined) updateData.secondMgrId = data.second_mgr_id ? Number(data.second_mgr_id) : null;
    if (data.final_score !== undefined) updateData.finalScore = data.final_score;
    if (data.final_grade !== undefined) updateData.finalGrade = data.final_grade;
    if (data.selected_grade !== undefined) updateData.selectedGrade = data.selected_grade;
    if (data.second_selected_grade !== undefined) updateData.second_selected_grade = data.second_selected_grade;
    if (data.locked !== undefined) updateData.locked = Number(data.locked);
    if (data.locked_at !== undefined) updateData.locked_at = data.locked_at;

    const result = await this.prisma.finalEvaluation.upsert({
      where: { evalId: Number(evalId) },
      create: { evalId: Number(evalId), ...updateData },
      update: updateData
    });
    return result.id;
  }

  async upsertScores(finalId, scores, scoreField) {
    if (!['selfScore', 'mgrScore', 'secondMgrScore'].includes(scoreField)) {
      throw new Error(`Invalid scoreField: ${scoreField}`);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const s of (scores || [])) {
        if (s.score === undefined || s.score === null) continue;
        const existing = await tx.finalEvalScore.findFirst({
          where: { finalId: Number(finalId), goalId: Number(s.goal_id) }
        });
        if (existing) {
          await tx.finalEvalScore.update({
            where: { id: existing.id },
            data: { [scoreField]: Number(s.score) }
          });
        } else {
          await tx.finalEvalScore.create({
            data: {
              finalId: Number(finalId),
              goalId: Number(s.goal_id),
              [scoreField]: Number(s.score)
            }
          });
        }
      }
    });
  }

  async findById(id) {
    const fe = await this.prisma.finalEvaluation.findUnique({
      where: { id: Number(id) },
      include: { scores: true }
    });
    return this._flatten(fe);
  }

  async resetForUnlock(finalId) {
    await this.prisma.$transaction(async (tx) => {
      await tx.finalEvaluation.update({
        where: { id: Number(finalId) },
        data: {
          locked: 0,
          locked_at: null,
          selfDone: 0,
          self_done_at: null,
          mgrDone: 0,
          mgr_done_at: null,
          mgrApproverId: null,
          secondMgrDone: 0,
          second_mgr_done_at: null,
          secondMgrId: null,
          finalScore: null,
          finalGrade: null,
          selectedGrade: null,
        }
      });
      await tx.finalEvalScore.updateMany({
        where: { finalId: Number(finalId) },
        data: { mgrScore: null, secondMgrScore: null }
      });
    });
  }
}

module.exports = PrismaFinalEvaluationRepository;
