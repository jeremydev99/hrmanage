const FinalEvaluationRepository = require('../../repositories/FinalEvaluationRepository');
const crypto = require('crypto');

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

  // 실제 schema.prisma의 필드명(일부 snake_case 혼재)에 맞춰 평탄화
  _flatten(fe) {
    if (!fe) return null;
    const {
      scores, evalId, selfNote, selfDone, self_done_at,
      mgrNote, mgrDone, mgr_done_at, mgrApproverId,
      finalScore, finalGrade, selectedGrade,
      secondMgrDone, second_mgr_done_at, secondMgrNote, secondMgrId,
      second_selected_grade, locked_at, evalCycle,
      ...rest
    } = fe;
    return {
      ...rest,
      eval_id: evalId,
      self_note: selfNote ? this._decrypt(selfNote) : '',
      self_done: selfDone,
      self_done_at,
      mgr_note: mgrNote ? this._decrypt(mgrNote) : '',
      mgr_done: mgrDone,
      mgr_done_at,
      mgr_approver_id: mgrApproverId,
      final_score: finalScore,
      final_grade: finalGrade,
      selected_grade: selectedGrade,
      second_mgr_done: secondMgrDone,
      second_mgr_done_at,
      second_mgr_note: secondMgrNote ? this._decrypt(secondMgrNote) : '',
      second_mgr_id: secondMgrId,
      second_selected_grade,
      locked_at,
      scores: (scores || []).map(s => this._flattenScore(s))
    };
  }

  _flattenScore(s) {
    if (!s) return null;
    const { finalId, goalId, selfScore, mgrScore, secondMgrScore, ...rest } = s;
    return {
      ...rest,
      final_id: finalId,
      goal_id: goalId,
      self_score: selfScore,
      mgr_score: mgrScore,
      second_mgr_score: secondMgrScore
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
}

module.exports = PrismaFinalEvaluationRepository;
