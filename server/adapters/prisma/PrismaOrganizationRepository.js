const OrganizationRepository = require('../../repositories/OrganizationRepository');

/**
 * Prisma 기반 OrganizationRepository 구현체
 * explicit relation(OrgLeader, OrgHierarchy, OrgMembers) 기반 include 사용.
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

  /**
   * Prisma 응답을 기존 SQL 결과 형태로 평탄화
   * 클라이언트가 기대하는 snake_case 필드명 유지
   */
  _flatten(org) {
    if (!org) return null;
    const { leader, parent, leaderId, parentId, sortOrder, isActive, ...rest } = org;
    return {
      ...rest,
      leader_id: leaderId,
      parent_id: parentId,
      sort_order: sortOrder,
      is_active: isActive,
      leader_name: leader?.name || null,
      leader_title: leader?.title || null,
      parent_name: parent?.name || null,
    };
  }

  async findAllActiveWithRelations() {
    const orgs = await this.prisma.organization.findMany({
      where: { isActive: 1 },
      include: {
        leader: { select: { name: true, title: true } },
        parent: { select: { name: true } },
      },
      orderBy: [
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
    });
    return orgs.map(o => this._flatten(o));
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
