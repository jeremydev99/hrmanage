const GoalRepository = require('../../repositories/GoalRepository');
const crypto = require('crypto');

class PrismaGoalRepository extends GoalRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaGoalRepository requires a prismaClient instance');
    }
    if (!encSecret) {
      throw new Error('PrismaGoalRepository requires encSecret for encryption');
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

  _flatten(g) {
    if (!g) return null;
    const { category, evalCycle, evalId, categoryId, sortOrder, name, kpi, ...rest } = g;
    return {
      ...rest,
      eval_id: evalId,
      category_id: categoryId,
      sort_order: sortOrder,
      name: name ? this._decrypt(name) : '',
      kpi: kpi ? this._decrypt(kpi) : '',
      cat_name: category?.name || null,
      color: category?.color || null,
      text_color: category?.textColor || null
    };
  }

  async findByEvalId(evalId) {
    const goals = await this.prisma.goal.findMany({
      where: { evalId: Number(evalId) },
      include: {
        category: { select: { name: true, color: true, textColor: true, sortOrder: true } }
      },
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' }
      ]
    });
    return goals.map(g => this._flatten(g));
  }

  async replaceByEvalId(evalId, goals) {
    await this.prisma.$transaction(async (tx) => {
      await tx.goal.deleteMany({
        where: { evalId: Number(evalId) }
      });
      if (goals && goals.length > 0) {
        const data = goals.map((g, i) => ({
          evalId: Number(evalId),
          categoryId: Number(g.category_id),
          name: this._encrypt(g.name || ''),
          kpi: this._encrypt(g.kpi || ''),
          weight: Number(g.weight) || 0,
          sortOrder: i,
          status: 'draft'
        }));
        for (const item of data) {
          await tx.goal.create({ data: item });
        }
      }
    });
  }

  async updateStatusByEvalId(evalId, status) {
    await this.prisma.goal.updateMany({
      where: { evalId: Number(evalId) },
      data: { status }
    });
  }
}

module.exports = PrismaGoalRepository;
