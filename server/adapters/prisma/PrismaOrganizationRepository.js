const OrganizationRepository = require('../../repositories/OrganizationRepository');

/**
 * Prisma 기반 OrganizationRepository 구현체
 * schema.prisma에 명시적 relation이 없으므로 $queryRaw로 JOIN 처리.
 * 응답 형태는 기존 SQL 결과와 동일 (leader_name, leader_title, parent_name 평탄화).
 */
class PrismaOrganizationRepository extends OrganizationRepository {
  constructor(prismaClient) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaOrganizationRepository requires a prismaClient instance');
    }
    this.prisma = prismaClient;
  }

  async findAllActiveWithRelations() {
    return await this.prisma.$queryRaw`
      SELECT o.*, u.name as leader_name, u.title as leader_title, p.name as parent_name
      FROM organizations o
      LEFT JOIN users u ON o.leader_id = u.id
      LEFT JOIN organizations p ON o.parent_id = p.id
      WHERE o.is_active = 1
      ORDER BY o.sort_order, o.id
    `;
  }

  async create(data) {
    const created = await this.prisma.organization.create({
      data: {
        name: data.name,
        leaderId: data.leader_id != null ? Number(data.leader_id) : null,
        parentId: data.parent_id != null ? Number(data.parent_id) : null,
        description: data.description || '',
        sortOrder: data.sort_order != null ? Number(data.sort_order) : 0,
      }
    });
    return created.id;
  }

  async update(id, data) {
    await this.prisma.organization.update({
      where: { id: Number(id) },
      data: {
        name: data.name,
        leaderId: data.leader_id != null ? Number(data.leader_id) : null,
        parentId: data.parent_id != null ? Number(data.parent_id) : null,
        description: data.description || '',
        sortOrder: data.sort_order != null ? Number(data.sort_order) : 0,
      }
    });
  }

  async deactivate(id) {
    const org = await this.prisma.organization.findUnique({
      where: { id: Number(id) },
      select: { id: true, name: true }
    });
    await this.prisma.organization.update({
      where: { id: Number(id) },
      data: { isActive: 0 }
    });
    return org;
  }

  async findNameById(id) {
    return await this.prisma.organization.findUnique({
      where: { id: Number(id) },
      select: { name: true }
    });
  }
}

module.exports = PrismaOrganizationRepository;
