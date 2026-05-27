const UserRepository = require('../../repositories/UserRepository');
const { _toStr } = require('./_helpers');

/**
 * Prisma의 camelCase 응답을 기존 server/index.js와 호환되는 snake_case로 변환
 * 기존 코드는 user.manager_id, user.is_active 형태로 접근하므로
 * 클라이언트 측 호환성 유지를 위해 필요
 */
function toSnakeCase(user) {
  if (!user) return user;
  return {
    id:             user.id,
    name:           user.name,
    email:          user.email,
    password_hash:  user.passwordHash,
    role:           user.role,
    dept:           user.dept,
    title:          user.title,
    manager_id:     user.managerId,
    is_active:      user.isActive,
    account_status: user.accountStatus,
    signup_note:    user.signupNote,
    grade:          user.grade,
    eval_mode:      user.evalMode,
    org_id:         user.orgId,
    // SQLite: created_at String? (snake_case 필드) / PG: createdAt DateTime? @map("created_at")
    created_at:     _toStr(user.createdAt ?? user.created_at),
  };
}

/**
 * Prisma 기반 UserRepository 구현체
 */
class PrismaUserRepository extends UserRepository {
  constructor(prismaClient) {
    super();
    if (!prismaClient) {
      throw new Error('PrismaUserRepository requires a prismaClient instance');
    }
    this.prisma = prismaClient;
  }

  async findById(id) {
    if (!id) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: Number(id) }
    });
    return toSnakeCase(user);
  }

  async findByEmail(email) {
    if (!email) return null;
    const user = await this.prisma.user.findUnique({
      where: { email: String(email) }
    });
    return toSnakeCase(user);
  }

  async findAllActive() {
    const users = await this.prisma.user.findMany({
      where: { isActive: 1 },
      orderBy: { id: 'asc' }
    });
    return users.map(toSnakeCase);
  }

  async findByOrgId(orgId) {
    return await this.prisma.user.findMany({
      where: { orgId: Number(orgId), isActive: 1 },
      select: { id: true, name: true, title: true, grade: true, dept: true, role: true }
    });
  }

  async updatePassword(userId, newPasswordHash) {
    await this.prisma.user.update({
      where: { id: Number(userId) },
      data: { passwordHash: newPasswordHash },
    });
    return true;
  }

  async isInApproverChain(approverId, targetUserId) {
    const approverIdStr = String(approverId);
    let currentUserId = Number(targetUserId);

    for (let depth = 0; depth < 10; depth++) {
      const user = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { managerId: true }
      });
      if (!user || !user.managerId) return false;
      if (String(user.managerId) === approverIdStr) return true;
      currentUserId = user.managerId;
    }
    return false;
  }
}

module.exports = PrismaUserRepository;
