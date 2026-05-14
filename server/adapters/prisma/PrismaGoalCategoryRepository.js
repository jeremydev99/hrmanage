const GoalCategoryRepository = require('../../repositories/GoalCategoryRepository');

/**
 * Prisma의 camelCase 응답을 기존 server/index.js와 호환되는 snake_case로 변환
 */
function toSnakeCase(cat) {
  if (!cat) return cat;
  return {
    id: cat.id,
    name: cat.name,
    description: cat.description,
    weight: cat.weight,
    color: cat.color,
    text_color: cat.textColor,
    sort_order: cat.sortOrder,
    is_active: cat.isActive,
    created_by: cat.created_by,
    created_at: cat.created_at,
  };
}

/**
 * Prisma 기반 GoalCategoryRepository 구현체
 */
class PrismaGoalCategoryRepository extends GoalCategoryRepository {
  constructor(prismaClient) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaGoalCategoryRepository requires a prismaClient instance');
    }
    this.prisma = prismaClient;
  }

  async findAllActive() {
    const categories = await this.prisma.goalCategory.findMany({
      where: { isActive: 1 },
      orderBy: { sortOrder: 'asc' }
    });
    return categories.map(toSnakeCase);
  }

  async create(data) {
    const created = await this.prisma.goalCategory.create({
      data: {
        name: data.name,
        description: data.description || '',
        weight: data.weight || 0,
        color: data.color || '#E6F1FB',
        textColor: data.text_color || '#0C447C',
        sortOrder: data.sort_order || 0,
        created_by: data.created_by,
      }
    });
    return created.id;
  }

  async update(id, data) {
    await this.prisma.goalCategory.update({
      where: { id: Number(id) },
      data: {
        name: data.name,
        description: data.description,
        weight: data.weight,
        color: data.color,
        textColor: data.text_color,
        sortOrder: data.sort_order,
        isActive: data.is_active ?? 1,
      }
    });
    return true;
  }

  async deactivate(id) {
    await this.prisma.goalCategory.update({
      where: { id: Number(id) },
      data: { isActive: 0 }
    });
    return true;
  }
}

module.exports = PrismaGoalCategoryRepository;
