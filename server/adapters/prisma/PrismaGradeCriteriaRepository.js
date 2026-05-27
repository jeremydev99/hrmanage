const GradeCriteriaRepository = require('../../repositories/GradeCriteriaRepository');
const { _toStr } = require('./_helpers');

function toSnakeCase(item) {
  if (!item) return item;
  return {
    id:          item.id,
    grade_code:  item.gradeCode,
    grade_name:  item.gradeName,
    description: item.description,
    note:        item.note,
    sort_order:  item.sortOrder,
    is_active:   item.isActive,
    // SQLite: created_at String? (snake_case 필드) / PG: createdAt DateTime? @map("created_at")
    created_at:  _toStr(item.createdAt ?? item.created_at),
  };
}

class PrismaGradeCriteriaRepository extends GradeCriteriaRepository {
  constructor(prismaClient) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaGradeCriteriaRepository requires a prismaClient instance');
    }
    this.prisma = prismaClient;
  }

  async findAll() {
    const items = await this.prisma.gradeCriteria.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
    });
    return items.map(toSnakeCase);
  }

  async create(data) {
    const created = await this.prisma.gradeCriteria.create({
      data: {
        gradeCode: data.grade_code,
        gradeName: data.grade_name,
        description: data.description || '',
        note: data.note || '',
        sortOrder: data.sort_order,
      }
    });
    return created.id;
  }

  async update(id, data) {
    const updateData = {
      gradeCode: data.grade_code,
      gradeName: data.grade_name,
      description: data.description || '',
      note: data.note || '',
    };
    if (data.sort_order !== undefined && data.sort_order !== null) {
      updateData.sortOrder = data.sort_order;
    }
    await this.prisma.gradeCriteria.update({
      where: { id: Number(id) },
      data: updateData,
    });
    return true;
  }

  async delete(id) {
    await this.prisma.gradeCriteria.delete({
      where: { id: Number(id) }
    });
    return true;
  }

  async count() {
    return await this.prisma.gradeCriteria.count();
  }

  async getMaxSortOrder() {
    const result = await this.prisma.gradeCriteria.aggregate({
      _max: { sortOrder: true }
    });
    return result._max.sortOrder || 0;
  }

  async resequenceSortOrder() {
    const remaining = await this.prisma.gradeCriteria.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true }
    });
    for (let i = 0; i < remaining.length; i++) {
      await this.prisma.gradeCriteria.update({
        where: { id: remaining[i].id },
        data: { sortOrder: i + 1 }
      });
    }
  }
}

module.exports = PrismaGradeCriteriaRepository;
