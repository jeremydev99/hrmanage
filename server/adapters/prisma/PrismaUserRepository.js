const UserRepository = require('../../repositories/UserRepository');
const { _toStr } = require('./_helpers');

// PG는 Int 필드에 문자열 거부 → 라우터에서 넘어오는 string/빈값을 안전하게 변환
function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

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

  // ── INFRA-A2: auth 도메인 전환을 위한 추가 메서드 ──────────

  async createSignup({ name, email, passwordHash, dept, title, signupNote }) {
    const user = await this.prisma.user.create({
      data: {
        name, email, passwordHash,
        role: 'user',
        dept: dept || '',
        title: title || '',
        accountStatus: 'pending',
        signupNote: signupNote || '',
        isActive: 0,
      },
    });
    return user.id;
  }

  async updateOrgId(id, orgId) {
    await this.prisma.user.update({
      where: { id: Number(id) },
      data: { orgId: toIntOrNull(orgId) },
    });
  }

  // ── INFRA-A1: users 도메인 전환을 위한 추가 메서드 ──────────────

  async findAll() {
    const users = await this.prisma.user.findMany({ orderBy: { id: 'asc' } });
    return users.map(toSnakeCase);
  }

  async findSignupRequests() {
    const users = await this.prisma.user.findMany({
      where: { accountStatus: { in: ['pending', 'rejected'] } },
      orderBy: { created_at: 'desc' },
    });
    return users.map(u => ({
      id: u.id, name: u.name, email: u.email, dept: u.dept, title: u.title,
      signup_note: u.signupNote, account_status: u.accountStatus,
      created_at: _toStr(u.createdAt ?? u.created_at),
    }));
  }

  async createAdmin({ name, email, passwordHash, role, dept, title, managerId }) {
    const user = await this.prisma.user.create({
      data: {
        name, email, passwordHash,
        role: role || 'user',
        dept: dept || '',
        title: title || '',
        managerId: toIntOrNull(managerId),
      },
    });
    return user.id;
  }

  async updatePartial(id, { role, dept, title, manager_id, is_active }) {
    const data = {};
    if (role !== undefined) data.role = role;
    if (dept !== undefined) data.dept = dept;
    if (title !== undefined) data.title = title;
    if (manager_id !== undefined) data.managerId = toIntOrNull(manager_id);
    if (is_active !== undefined) data.isActive = is_active;
    if (Object.keys(data).length === 0) return;
    await this.prisma.user.update({ where: { id: Number(id) }, data });
  }

  async approveSignup(id, { role, dept, title, managerId, orgId }) {
    const data = { accountStatus: 'approved', isActive: 1, role: role || 'user', managerId: toIntOrNull(managerId), orgId: toIntOrNull(orgId) };
    if (dept !== undefined) data.dept = dept;
    if (title !== undefined) data.title = title;
    await this.prisma.user.update({ where: { id: Number(id) }, data });
  }

  async rejectSignup(id) {
    await this.prisma.user.update({
      where: { id: Number(id) },
      data: { accountStatus: 'rejected', isActive: 0 },
    });
  }

  async toggleActive(id) {
    const user = await this.prisma.user.findUnique({
      where: { id: Number(id) }, select: { isActive: true },
    });
    if (!user) return null;
    const newVal = user.isActive ? 0 : 1;
    await this.prisma.user.update({ where: { id: Number(id) }, data: { isActive: newVal } });
    return newVal;
  }

  async getApproverChain(userId) {
    const approvers = [];
    let curUser = await this.prisma.user.findUnique({
      where: { id: Number(userId) }, select: { managerId: true },
    });
    let level = 0;
    while (curUser?.managerId && level < 5) {
      const mgr = await this.prisma.user.findUnique({
        where: { id: curUser.managerId },
        select: { id: true, name: true, dept: true, title: true, managerId: true },
      });
      if (!mgr) break;
      approvers.push({ id: mgr.id, name: mgr.name, dept: mgr.dept, title: mgr.title, manager_id: mgr.managerId, level: ++level });
      curUser = mgr;
    }
    return approvers;
  }
}

module.exports = PrismaUserRepository;
