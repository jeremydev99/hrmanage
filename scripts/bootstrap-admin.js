/**
 * bootstrap-admin.js — 초기 관리자 계정 부트스트랩 (멱등)
 *
 * 외부 판매 범용 스크립트. 계정 정보·비번은 환경변수로 주입.
 * 스크립트에 사람 이름·비번 하드코딩 금지.
 *
 * 사용 예:
 *   ADMIN1_NAME=홍길동 ADMIN1_EMAIL=ceo@company.com ADMIN1_PW=<강한비번> \
 *   ADMIN1_ROLE=admin ADMIN1_DEPT=경영진 ADMIN1_TITLE=대표이사 \
 *   ADMIN2_NAME=김인사 ADMIN2_EMAIL=hr@company.com ADMIN2_PW=<강한비번> \
 *   ADMIN2_ROLE=master ADMIN2_DEPT=경영지원 ADMIN2_TITLE=이사 \
 *   node scripts/bootstrap-admin.js
 *
 * - ADMIN1 이 먼저 생성됨 (managerId=null). ADMIN2의 managerId = ADMIN1.id.
 * - 이미 존재하는 이메일은 skip (멱등). 비번 재설정이 필요하면 앱 UI 사용.
 * - ADMIN1_ROLE 기본값: admin / ADMIN2_ROLE 기본값: master
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function require_env(key) {
  const val = process.env[key] || '';
  if (!val) {
    console.error(`[오류] 환경변수 ${key} 가 비어 있습니다.`);
    process.exit(1);
  }
  return val;
}

async function upsertUser(data, label) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    console.log(`[skip] ${label} (${data.email}) 이미 존재 → id=${existing.id}`);
    return existing;
  }
  const passwordHash = bcrypt.hashSync(data.pw, 10);
  const created = await prisma.user.create({
    data: {
      name:          data.name,
      email:         data.email,
      passwordHash,
      role:          data.role,
      dept:          data.dept  || null,
      title:         data.title || null,
      managerId:     data.managerId || null,
      isActive:      1,
      accountStatus: 'approved',
    },
  });
  console.log(`[생성] ${label} (${data.email}) → id=${created.id}, role=${data.role}`);
  return created;
}

async function main() {
  const u1 = {
    name:  require_env('ADMIN1_NAME'),
    email: require_env('ADMIN1_EMAIL'),
    pw:    require_env('ADMIN1_PW'),
    role:  process.env.ADMIN1_ROLE  || 'admin',
    dept:  process.env.ADMIN1_DEPT  || '',
    title: process.env.ADMIN1_TITLE || '',
  };
  const u2 = {
    name:  require_env('ADMIN2_NAME'),
    email: require_env('ADMIN2_EMAIL'),
    pw:    require_env('ADMIN2_PW'),
    role:  process.env.ADMIN2_ROLE  || 'master',
    dept:  process.env.ADMIN2_DEPT  || '',
    title: process.env.ADMIN2_TITLE || '',
  };

  console.log('=== 초기 관리자 부트스트랩 시작 ===');

  const user1 = await upsertUser({ ...u1, managerId: null }, 'ADMIN1');
  await upsertUser({ ...u2, managerId: user1.id },           'ADMIN2');

  console.log('=== 부트스트랩 완료 ===');
  console.log('첫 로그인 후 반드시 비밀번호를 변경하세요 (설정 → 비밀번호 변경).');
}

main()
  .catch(e => { console.error('[오류]', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
