const FeedbackRepository = require('../../repositories/FeedbackRepository');
const crypto = require('crypto');

class PrismaFeedbackRepository extends FeedbackRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaFeedbackRepository requires a prismaClient instance');
    }
    if (!encSecret) {
      throw new Error('PrismaFeedbackRepository requires encSecret');
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

  _flattenFeedback(fb) {
    if (!fb) return null;
    const { author, items, evalId, authorId, overallNote, ...rest } = fb;
    return {
      ...rest,
      eval_id: evalId,
      author_id: authorId,
      author_name: author?.name || null,
      overall_note: overallNote ? this._decrypt(overallNote) : '',
      items: (items || []).map(it => this._flattenItem(it))
    };
  }

  _flattenItem(it) {
    if (!it) return null;
    const { goal, feedbackId, goalId, note, ...rest } = it;
    return {
      ...rest,
      feedback_id: feedbackId,
      goal_id: goalId,
      note: note ? this._decrypt(note) : '',
      goal_name: goal?.name ? this._decrypt(goal.name) : null
    };
  }

  async findByEvalId(evalId) {
    const feedbacks = await this.prisma.feedback.findMany({
      where: { evalId: Number(evalId) },
      include: {
        author: { select: { name: true } },
        items: {
          include: {
            goal: { select: { name: true } }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
    return feedbacks.map(fb => this._flattenFeedback(fb));
  }

  async create(data) {
    return await this.prisma.$transaction(async (tx) => {
      const fb = await tx.feedback.create({
        data: {
          evalId: Number(data.eval_id),
          authorId: Number(data.author_id),
          overallNote: this._encrypt(data.overall_note || '')
        }
      });
      if (data.items && data.items.length > 0) {
        for (const it of data.items) {
          await tx.feedbackItem.create({
            data: {
              feedbackId: fb.id,
              goalId: Number(it.goal_id),
              score: it.score !== undefined && it.score !== null ? Number(it.score) : null,
              note: this._encrypt(it.note || '')
            }
          });
        }
      }
      return fb.id;
    });
  }
}

module.exports = PrismaFeedbackRepository;
