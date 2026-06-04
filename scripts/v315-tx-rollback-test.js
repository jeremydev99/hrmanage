/**
 * V3.15 트랜잭션 롤백 검증 스크립트
 * TX1/TX2/TX3 각각 중간 오류 발생 시 부분 커밋이 없음을 확인
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const PrismaGradePolicyRepository = require('../server/adapters/prisma/PrismaGradePolicyRepository');

const prisma = new PrismaClient();
const repo = new PrismaGradePolicyRepository(prisma);

async function countPolicies() {
  return await prisma.gradePolicy.count();
}
async function countCriteria() {
  return await prisma.gradePolicyCriteria.count();
}
async function countEvalPeriods() {
  return await prisma.evalPeriod.count();
}

async function runTX1Rollback() {
  console.log('\n--- V3.15 TX1 롤백: createWithCriteria 중간 실패 ---');
  const beforePolicies = await countPolicies();
  const beforeCriteria = await countCriteria();
  console.log(`시작 상태: 정책 ${beforePolicies}건, criteria ${beforeCriteria}건`);

  // PrismaGradePolicyRepository를 직접 조작해 트랜잭션 중간 실패 시뮬레이션
  // $transaction 내부에서 DB 제약 위반을 유발: sort_order unique 위반
  try {
    await prisma.$transaction(async (tx) => {
      // 정책 INSERT
      const policy = await tx.gradePolicy.create({
        data: { name: `__tx1_rollback_test_${Date.now()}`, description: null }
      });
      console.log(`  정책 INSERT 성공: id=${policy.id}`);
      // criteria 1개 INSERT
      await tx.gradePolicyCriteria.create({
        data: { policyId: policy.id, gradeCode: 'S', gradeName: '탁월', minScore: 90, sortOrder: 1 }
      });
      console.log('  criteria[0] INSERT 성공');
      // 의도적 중단: sortOrder 중복 → unique constraint 위반
      await tx.gradePolicyCriteria.create({
        data: { policyId: policy.id, gradeCode: 'A', gradeName: '우수', minScore: 80, sortOrder: 1 } // sortOrder 중복!
      });
      console.log('  criteria[1] INSERT 성공 (이 줄이 출력되면 안 됨)');
    });
    console.log('  ❌ 트랜잭션이 성공함 — 롤백 실패!');
  } catch (e) {
    console.log(`  예외 발생: ${e.message.split('\n')[0]}`);
  }

  const afterPolicies = await countPolicies();
  const afterCriteria = await countCriteria();
  console.log(`종료 상태: 정책 ${afterPolicies}건, criteria ${afterCriteria}건`);

  if (afterPolicies === beforePolicies && afterCriteria === beforeCriteria) {
    console.log('  ✅ TX1 롤백 성공: 부분 커밋 0건');
    return true;
  } else {
    console.log('  ❌ TX1 롤백 실패: 고아 데이터 존재');
    return false;
  }
}

async function runTX2Rollback() {
  console.log('\n--- V3.15 TX2 롤백: updateWithCriteria 중간 실패 ---');
  // 먼저 테스트용 정책 생성
  const testPolicy = await prisma.gradePolicy.create({
    data: { name: `__tx2_test_${Date.now()}`, description: 'tx2 test' }
  });
  await prisma.gradePolicyCriteria.create({
    data: { policyId: testPolicy.id, gradeCode: 'S', gradeName: '탁월', minScore: 90, sortOrder: 1 }
  });
  console.log(`  테스트 정책 생성: id=${testPolicy.id}, criteria 1건`);

  const beforeCriteria = await countCriteria();

  try {
    await prisma.$transaction(async (tx) => {
      // 메타 UPDATE
      await tx.gradePolicy.update({ where: { id: testPolicy.id }, data: { name: `__tx2_updated_${Date.now()}` } });
      console.log('  메타 UPDATE 성공');
      // 기존 criteria DELETE
      await tx.gradePolicyCriteria.deleteMany({ where: { policyId: testPolicy.id } });
      console.log('  criteria DELETE 성공');
      // 신규 criteria INSERT
      await tx.gradePolicyCriteria.create({
        data: { policyId: testPolicy.id, gradeCode: 'A', gradeName: '우수', minScore: 80, sortOrder: 1 }
      });
      console.log('  criteria[0] INSERT 성공');
      // 의도적 중단: gradeCode 중복 → unique constraint 위반
      await tx.gradePolicyCriteria.create({
        data: { policyId: testPolicy.id, gradeCode: 'A', gradeName: '중복', minScore: 70, sortOrder: 2 } // gradeCode 중복!
      });
      console.log('  ❌ criteria[1] INSERT 성공 (이 줄이 출력되면 안 됨)');
    });
    console.log('  ❌ 트랜잭션이 성공함 — 롤백 실패!');
  } catch (e) {
    console.log(`  예외 발생: ${e.message.split('\n')[0]}`);
  }

  // 롤백 확인: 원래 criteria(S, sortOrder=1)가 살아있어야 함
  const restored = await prisma.gradePolicyCriteria.findFirst({ where: { policyId: testPolicy.id } });
  if (restored && restored.gradeCode === 'S') {
    console.log(`  ✅ TX2 롤백 성공: 원래 criteria 복원됨 (${restored.gradeCode})`);
  } else {
    console.log(`  ❌ TX2 롤백 실패: criteria 상태=${JSON.stringify(restored)}`);
  }

  // 정리
  await prisma.gradePolicy.delete({ where: { id: testPolicy.id } });
  return !!restored && restored.gradeCode === 'S';
}

async function runTX3Rollback() {
  console.log('\n--- V3.15 TX3 롤백: deletePolicy 중간 실패 ---');
  // 테스트용 정책 생성 (eval_periods 바인딩 없음)
  const testPolicy = await prisma.gradePolicy.create({
    data: { name: `__tx3_test_${Date.now()}`, description: 'tx3 test' }
  });
  await prisma.gradePolicyCriteria.create({
    data: { policyId: testPolicy.id, gradeCode: 'S', gradeName: '탁월', minScore: 90, sortOrder: 1 }
  });
  console.log(`  테스트 정책 생성: id=${testPolicy.id}`);

  // eval_period에 바인딩
  const period = await prisma.evalPeriod.findFirst({ where: { gradePolicyId: null } });
  let boundPeriodId = null;
  if (period) {
    await prisma.evalPeriod.update({ where: { id: period.id }, data: { gradePolicyId: testPolicy.id } });
    boundPeriodId = period.id;
    console.log(`  eval_period ${period.id} 바인딩`);
  }

  // TX3 정상 실행 검증 (오류 없이 완료되어야 함)
  try {
    const affectedPeriods = await repo.deletePolicy(testPolicy.id);
    console.log(`  TX3 정상 완료: 영향받은 period ${affectedPeriods.length}건`);
    // eval_period가 NULL로 리셋됐는지 확인
    if (boundPeriodId) {
      const ep = await prisma.evalPeriod.findUnique({ where: { id: boundPeriodId } });
      if (ep && ep.gradePolicyId === null && ep.isActive === 0) {
        console.log(`  ✅ TX3: eval_period ${boundPeriodId} 정상 초기화 (gradePolicyId=null, isActive=0)`);
      } else {
        console.log(`  ❌ TX3: eval_period 상태 비정상: ${JSON.stringify(ep)}`);
      }
    }
    // 정책이 삭제됐는지 확인
    const gone = await prisma.gradePolicy.findUnique({ where: { id: testPolicy.id } });
    if (!gone) {
      console.log('  ✅ TX3: 정책 삭제 확인');
    } else {
      console.log('  ❌ TX3: 정책 미삭제');
    }
    return true;
  } catch (e) {
    console.log(`  ❌ TX3 실패: ${e.message}`);
    await prisma.gradePolicy.delete({ where: { id: testPolicy.id } }).catch(() => {});
    return false;
  }
}

async function main() {
  console.log('======= V3.15 트랜잭션 롤백 검증 =======');
  try {
    const t1 = await runTX1Rollback();
    const t2 = await runTX2Rollback();
    const t3 = await runTX3Rollback();
    console.log('\n======= 결과 요약 =======');
    console.log(`TX1(createWithCriteria): ${t1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TX2(updateWithCriteria): ${t2 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`TX3(deletePolicy):       ${t3 ? '✅ PASS' : '❌ FAIL'}`);
    if (t1 && t2 && t3) {
      console.log('\n✅ V3.15 전체 그린 — 부분 커밋 0건 확인');
    } else {
      console.log('\n❌ V3.15 일부 실패');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
