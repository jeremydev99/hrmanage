const OrganizationRepository = require('../../repositories/OrganizationRepository');
const { _toStr } = require('./_helpers');

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

  // 명시적 매핑 — SQLite(snake_case 필드) / PostgreSQL(camelCase 필드) 양쪽 호환
  _flatten(org) {
    if (!org) return null;
    return {
      id:           org.id,
      name:         org.name,
      description:  org.description,
      leader_id:    org.leaderId,
      parent_id:    org.parentId,
      sort_order:   org.sortOrder,
      is_active:    org.isActive,
      created_at:   _toStr(org.createdAt ?? org.created_at),
      leader_name:  org.leader?.name  || null,
      leader_title: org.leader?.title || null,
      parent_name:  org.parent?.name  || null,
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
