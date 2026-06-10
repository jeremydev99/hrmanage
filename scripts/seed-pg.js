/**
 * seed-pg.js — Prisma 기반 초기 데이터 시드 (PG/SQLite 공용)
 *
 * 용도: Phase B3 NCloud PG 신규 배포 시 기초 데이터 초기화
 * 실행: node scripts/seed-pg.js
 *
 * 멱등성: 이미 존재하는 데이터는 upsert/skip으로 보호
 * 등급 컷오프: 런타임 로직과 동일 (OI=90/EE=80/SC=70/ME=60/PB=50/IR=40)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── 등급 정책 컷오프 (런타임 getPolicyForEvalCycle과 동일) ─────
const GRADE_CRITERIA = [
  { code: 'OI', name: 'OI (Outstanding Impact)',    min: 90, order: 1 },
  { code: 'EE', name: 'EE (Exceeds Expectations)',  min: 80, order: 2 },
  { code: 'SC', name: 'SC (Strong Contributor)',    min: 70, order: 3 },
  { code: 'ME', name: 'ME (Meets Expectations)',    min: 60, order: 4 },
  { code: 'PB', name: 'PB (Performance Building)', min: 50, order: 5 },
  { code: 'IR', name: 'IR (Improvement Required)', min:  0, order: 6 },
];

// ── 초기 사용자 (seedInitialData와 동일) ────────────────────────
const USERS = [
  { id: 1, name: '이대표',  email: 'ceo@synapsoft.com',   pw: 'admin1234', role: 'master', dept: '경영진', title: '대표이사',     mgr: null },
  { id: 2, name: '김인사',  email: 'hr1@synapsoft.com',    pw: 'admin1234', role: 'master', dept: '인사팀', title: '인사팀장',     mgr: 1 },
  { id: 3, name: '박인사',  email: 'hr2@synapsoft.com',    pw: 'admin1234', role: 'admin',  dept: '인사팀', title: '인사팀원',     mgr: 2 },
  { id: 4, name: '최개발',  email: 'dev1@synapsoft.com',   pw: 'user1234',  role: 'user',   dept: '개발팀', title: '개발팀장',     mgr: 1 },
  { id: 5, name: '정개발',  email: 'dev2@synapsoft.com',   pw: 'user1234',  role: 'user',   dept: '개발팀', title: '시니어개발자', mgr: 4 },
  { id: 6, name: '한개발',  email: 'dev3@synapsoft.com',   pw: 'user1234',  role: 'user',   dept: '개발팀', title: '주니어개발자', mgr: 5 },
  { id: 7, name: '오영업',  email: 'sales1@synapsoft.com', pw: 'user1234',  role: 'user',   dept: '영업팀', title: '영업팀장',     mgr: 1 },
  { id: 8, name: '강영업',  email: 'sales2@synapsoft.com', pw: 'user1234',  role: 'user',   dept: '영업팀', title: '영업사원',     mgr: 7 },
];

// ── 카테고리 (seedInitialData와 동일) ───────────────────────────
const GOAL_CATEGORIES = [
  { name: '업적목표', description: '핵심 성과 및 목표 달성', weight: 50, color: '#FFF4EC', textColor: '#7A2F02', sortOrder: 1 },
  { name: '업무능력', description: '직무 역량 및 전문성',   weight: 30, color: '#E1F5EE', textColor: '#085041', sortOrder: 2 },
  { name: '근무태도', description: '협업, 책임감, 성실성',  weight: 20, color: '#EEEDFE', textColor: '#3C3489', sortOrder: 3 },
];

async function seedUsers() {
  console.log('👥 사용자 시드...');
  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`   ↳ 기존: ${u.email}`);
      continue;
    }
    const passwordHash = bcrypt.hashSync(u.pw, 10);
    await prisma.user.create({
      data: {
        name: u.name, email: u.email, passwordHash,
        role: u.role, dept: u.dept, title: u.title,
        managerId: u.mgr,
        isActive: 1, accountStatus: 'approved',
      },
    });
    console.log(`   ✅ 생성: ${u.email}`);
  }
}

async function seedOrganizations() {
  console.log('🏢 조직 시드...');
  const count = await prisma.organization.count();
  if (count > 0) {
    console.log('   ↳ 이미 존재 — skip');
    return;
  }
  const root = await prisma.organization.create({
    data: { name: '㈜사이냅소프트', leaderId: 1, parentId: null, sortOrder: 0, isActive: 1 },
  });
  const hr = await prisma.organization.create({
    data: { name: '인사팀', leaderId: 2, parentId: root.id, sortOrder: 1, isActive: 1 },
  });
  const dev = await prisma.organization.create({
    data: { name: '개발팀', leaderId: 4, parentId: root.id, sortOrder: 2, isActive: 1 },
  });
  const sales = await prisma.organization.create({
    data: { name: '영업팀', leaderId: 7, parentId: root.id, sortOrder: 3, isActive: 1 },
  });
  // 사용자 → 조직 매핑
  const orgMap = [
    [1, root.id], [2, hr.id], [3, hr.id],
    [4, dev.id],  [5, dev.id], [6, dev.id],
    [7, sales.id], [8, sales.id],
  ];
  for (const [userId, orgId] of orgMap) {
    const u = await prisma.user.findUnique({ where: { email: USERS[userId - 1].email } });
    if (u) await prisma.user.update({ where: { id: u.id }, data: { orgId } });
  }
  console.log(`   ✅ 조직 4개 생성, 사용자 매핑 완료`);
}

async function seedGoalCategories() {
  console.log('📂 카테고리 시드...');
  for (const c of GOAL_CATEGORIES) {
    const existing = await prisma.goalCategory.findFirst({ where: { name: c.name } });
    if (existing) {
      console.log(`   ↳ 기존: ${c.name}`);
      continue;
    }
    await prisma.goalCategory.create({
      data: { ...c, isActive: 1, created_by: 1 },
    });
    console.log(`   ✅ 생성: ${c.name}`);
  }
}

async function seedGradePolicy() {
  console.log('📊 등급 정책 시드...');
  const existing = await prisma.gradePolicy.findFirst({ where: { name: '사이냅 표준안' } });
  if (existing) {
    console.log('   ↳ 이미 존재 — skip');
    return existing.id;
  }
  const policy = await prisma.gradePolicy.create({
    data: {
      name: '사이냅 표준안',
      description: '운영 디폴트 등급 정책 (OI=90/EE=80/SC=70/ME=60/PB=50/IR=40)',
      createdBy: 1,
    },
  });
  for (const c of GRADE_CRITERIA) {
    await prisma.gradePolicyCriteria.upsert({
      where: { policyId_gradeCode: { policyId: policy.id, gradeCode: c.code } },
      update: {},
      create: {
        policyId: policy.id, gradeCode: c.code, gradeName: c.name,
        minScore: c.min, sortOrder: c.order,
      },
    });
  }
  console.log(`   ✅ 등급 정책 생성 (ID=${policy.id}), criteria 6건`);
  return policy.id;
}

async function seedAppSettings(policyId) {
  console.log('⚙️  앱 설정 시드...');
  const defaults = [
    { key: 'timezone',  value: 'Asia/Seoul' },
    { key: 'eval_mode', value: 'MBO' },
    { key: 'history_visibility', value: '1' },
    { key: 'history_inactive',   value: '0' },
    { key: 'feedback_limit',     value: '0' },
    { key: 'second_final',       value: '0' },
    { key: 'approval_edit',      value: '0' },
    { key: 'dashboard_depth',    value: '2' },
  ];
  for (const s of defaults) {
    await prisma.appSetting.upsert({
      where:  { key: s.key },
      update: {},
      create: { key: s.key, value: s.value },
    });
  }
  // 공지사항
  const noticeContent = '';
  await prisma.appSetting.upsert({
    where:  { key: 'notice' },
    update: {},
    create: { key: 'notice', value: noticeContent, updatedBy: 1 },
  });
  console.log(`   ✅ 기본 설정 ${defaults.length + 1}건 upsert`);
}

async function seedEvalPeriods(policyId) {
  console.log('📅 평가 기간 시드...');
  const TARGET_PERIODS = [
    { evalYear: '2024년', label: '2024년 1분기' },
    { evalYear: '2024년', label: '2024년 2분기' },
    { evalYear: '2024년', label: '2024년 3분기' },
    { evalYear: '2024년', label: '2024년 4분기' },
    { evalYear: '2025년', label: '2025년 1분기' },
    { evalYear: '2025년', label: '2025년 2분기' },
    { evalYear: '2025년', label: '2025년 3분기' },
    { evalYear: '2025년', label: '2025년 4분기' },
    { evalYear: '2026년', label: '2026년 1분기' },
  ];
  let created = 0;
  for (const t of TARGET_PERIODS) {
    const existing = await prisma.evalPeriod.findFirst({
      where: { evalYear: t.evalYear, periodLabel: t.label },
    });
    if (existing) continue;
    await prisma.evalPeriod.create({
      data: {
        periodType: 'quarter', periodLabel: t.label, evalYear: t.evalYear,
        isActive: 1, evalMode: 'MBO', locked: 0,
        gradePolicyId: policyId || null,
      },
    });
    created++;
  }
  console.log(`   ✅ 평가 기간 ${created}건 생성 (기존 ${TARGET_PERIODS.length - created}건 유지)`);
}

async function main() {
  console.log('🌱 seed-pg.js 시작 (provider:', process.env.DATABASE_URL?.split(':')[0] || 'sqlite', ')\n');
  try {
    await seedUsers();
    await seedOrganizations();
    await seedGoalCategories();
    const policyId = await seedGradePolicy();
    await seedAppSettings(policyId);
    await seedEvalPeriods(policyId);
    console.log('\n✅ seed-pg.js 완료');
  } catch (e) {
    console.error('\n❌ 시드 실패:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
