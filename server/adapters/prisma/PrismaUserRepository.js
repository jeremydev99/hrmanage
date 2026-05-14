const UserRepository = require('../../repositories/UserRepository');

/**
 * Prisma의 camelCase 응답을 기존 server/index.js와 호환되는 snake_case로 변환
 * 기존 코드는 user.manager_id, user.is_active 형태로 접근하므로
 * 클라이언트 측 호환성 유지를 위해 필요
 */
function toSnakeCase(user) {
  if (!user) return user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password_hash: user.passwordHash,
    role: user.role,
    dept: user.dept,
    title: user.title,
    manager_id: user.managerId,
    is_active: user.isActive,
    account_status: user.accountStatus,
    signup_note: user.signupNote,
    grade: user.grade,
    eval_mode: user.evalMode,
    org_id: user.orgId,
    created_at: user.created_at,
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
}

module.exports = PrismaUserRepository;
