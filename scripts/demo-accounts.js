/**
 * demo-accounts.js — 데모 3계정 비번 고정 + 로그인 공지 업데이트 (wipe 없음, 멱등)
 *
 * 대상:
 *   박기술 (cto@synapsoft.com)        → admin1234
 *   정플랫 (platform-lead@synapsoft)  → user1234
 *   한개발 (dev01@synapsoft.com)       → user1234
 *
 * 실행:
 *   node scripts/demo-accounts.js
 *   docker compose --profile postgres run --rm app node scripts/demo-accounts.js
 *
 * ※ 데모 전용 — 외부판매 전 공지 비번 노출 제거 필요(정리목록)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 비번 설정 대상 (이름 기준 조회)
const TARGETS = [
  { name: '박기술', pw: 'admin1234' },
  { name: '정플랫', pw: 'user1234'  },
  { name: '한개발', pw: 'user1234'  },
];

async function setPasswords() {
  console.log('🔑 데모 계정 비번 설정...');
  const results = [];
  for (const t of TARGETS) {
    const user = await prisma.user.findFirst({ where: { name: t.name }, select: { id: true, name: true, email: true } });
    if (!user) {
      console.warn(`   ⚠️  "${t.name}" 계정을 찾을 수 없음 — 이름 확인 필요`);
      continue;
    }
    const hash = bcrypt.hashSync(t.pw, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    console.log(`   ✅ ${user.name} (${user.email}) → ${t.pw}`);
    results.push({ name: user.name, email: user.email, pw: t.pw });
  }
  return results;
}

async function updateNotice(accounts) {
  console.log('\n📢 로그인 공지 업데이트...');

  // 한개발 이메일은 동적으로 가져온 값 사용
  const devUser = accounts.find(a => a.name === '한개발');
  const devEmail = devUser?.email || 'dev01@synapsoft.com';

  const notice = `📢 데모 테스트 계정
[마스터관리자] ceo@synapsoft.com / admin1234
[인사팀장] hr-lead@synapsoft.com / admin1234
[개발본부장] cto@synapsoft.com / admin1234        (박기술)
[플랫폼팀장] platform-lead@synapsoft.com / user1234 (정플랫)
[시니어개발자] ${devEmail} / user1234           (한개발)`;

  await prisma.appSetting.upsert({
    where:  { key: 'notice' },
    update: { value: notice, updatedBy: 1 },
    create: { key: 'notice', value: notice, updatedBy: 1 },
  });
  console.log('   ✅ 공지 업데이트 완료');
  return notice;
}

async function main() {
  console.log('🌱 demo-accounts.js 시작 (DEMO 전용 — 비번·공지 set, wipe 없음)\n');
  try {
    const accounts = await setPasswords();
    const notice = await updateNotice(accounts);
    console.log('\n📋 설정 완료 계정:');
    accounts.forEach(a => console.log(`  ${a.name} (${a.email}) / ${a.pw}`));
    console.log('\n💡 결재 라인: 한개발 → 정플랫(1차) → 박기술(2차)');
    console.log('\n✅ demo-accounts.js 완료');
  } catch (e) {
    console.error('❌ 실패:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
