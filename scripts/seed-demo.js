/**
 * seed-demo.js — 테스트서버용 리얼 데모 데이터 생성 (Prisma, PG)
 *
 * 목적: 35명 × 9완료기간 풀사이클 + 2026Q2 진행중 데이터 생성
 * 원칙: 앱 calcFinalScore·scoreToGrade 로직 재사용 (시드↔런타임 일치)
 * 안전: config(정책·카테고리·설정) 보존, 사용자·평가 데이터만 wipe+reload
 *
 * 실행:
 *   node scripts/seed-demo.js               # 로컬 Prisma
 *   docker compose run --rm app node scripts/seed-demo.js  # 컨테이너
 *
 * 리셋 재적재: 동일 명령 재실행 (멱등)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const PrismaAdminRepository = require('../server/adapters/prisma/PrismaAdminRepository');

const prisma = new PrismaClient();
const adminRepo = new PrismaAdminRepository(prisma);

// ── 앱 등급 계산 함수 (server/index.js:scoreToGrade 동일 구현) ─────────
function scoreToGrade(score, criteria) {
  if (score == null || isNaN(score)) return null;
  if (!criteria || !criteria.length) return null;
  for (const c of criteria) {  // min_score DESC 정렬 전제
    if (score >= c.min_score) return c.grade_code;
  }
  return null;
}

// ── 평가 기간 (2024Q1 ~ 2026Q2) ────────────────────────────────────────
const PERIODS = [
  { label: '2024년 1분기', year: '2024년' },
  { label: '2024년 2분기', year: '2024년' },
  { label: '2024년 3분기', year: '2024년' },
  { label: '2024년 4분기', year: '2024년' },
  { label: '2025년 1분기', year: '2025년' },
  { label: '2025년 2분기', year: '2025년' },
  { label: '2025년 3분기', year: '2025년' },
  { label: '2025년 4분기', year: '2025년' },
  { label: '2026년 1분기', year: '2026년' },  // 완료 마지막
  { label: '2026년 2분기', year: '2026년' },  // 진행 중
];
const COMPLETED_COUNT = 9;  // 2024Q1 ~ 2026Q1

// 2차 평가 대기로 만들 대상 (2026Q2) — 박기술이 2차 평가자인 정플랫 팀원 중 일부
// 한개발(dev01) + 임개발(dev02): 정플랫 직속 → 박기술 2차 대기 시연용
const CHAIN_2CHA_EMAILS = new Set(['dev01@synapsoft.com', 'dev02@synapsoft.com']);

// 목표 2차 승인(박기술, level 2) 생성 대상 — IA-2 필터 시연용(1차/2차 섞임)
// dev01·dev02: 정플랫 1차 → 박기술 2차 / dev03·dev04는 1차만(다양성)
const APPROVAL_2CHA_EMAILS = new Set(['dev01@synapsoft.com', 'dev02@synapsoft.com']);

// ── 큐레이션 로스터 (35명) ───────────────────────────────────────────────
// 역할: master = 인사시스템 관리자, admin = 관리자, user = 일반
const ROSTER = [
  // ── 경영진 ──
  { email:'ceo@synapsoft.com',        pw:'admin1234', role:'master', name:'이대표',  dept:'경영진',   title:'대표이사',     mgr:null,  profile:'top',     org:'root' },
  { email:'cfo@synapsoft.com',        pw:'admin1234', role:'user',   name:'김재무',  dept:'경영지원', title:'CFO/경영지원본부장', mgr:'ceo', profile:'top',     org:'mgmt' },
  { email:'cto@synapsoft.com',        pw:'admin1234', role:'user',   name:'박기술',  dept:'개발본부', title:'CTO/개발본부장',     mgr:'ceo', profile:'top',     org:'devhq' },
  { email:'cso@synapsoft.com',        pw:'user1234',  role:'user',   name:'최영업',  dept:'영업본부', title:'CSO/영업본부장',     mgr:'ceo', profile:'good',    org:'saleshq' },
  // ── 개발본부 ──
  { email:'platform-lead@synapsoft.com', pw:'user1234', role:'user', name:'정플랫',  dept:'개발본부', title:'플랫폼팀장',  mgr:'cto', profile:'top',    org:'platform' },
  { email:'dev01@synapsoft.com',      pw:'user1234',  role:'user',   name:'한개발',  dept:'개발본부', title:'시니어개발자', mgr:'platform-lead', profile:'good',    org:'platform' },
  { email:'dev02@synapsoft.com',      pw:'user1234',  role:'user',   name:'임개발',  dept:'개발본부', title:'시니어개발자', mgr:'platform-lead', profile:'average', org:'platform' },
  { email:'dev03@synapsoft.com',      pw:'user1234',  role:'user',   name:'윤주니어',dept:'개발본부', title:'개발자',     mgr:'platform-lead', profile:'improving',org:'platform' },
  { email:'dev04@synapsoft.com',      pw:'user1234',  role:'user',   name:'조주니어',dept:'개발본부', title:'개발자',     mgr:'platform-lead', profile:'average', org:'platform' },
  { email:'ai-lead@synapsoft.com',    pw:'user1234',  role:'user',   name:'오에이아이',dept:'개발본부',title:'AI팀장',    mgr:'cto', profile:'top',    org:'ai' },
  { email:'ai01@synapsoft.com',       pw:'user1234',  role:'user',   name:'권연구',  dept:'개발본부', title:'AI연구원',   mgr:'ai-lead', profile:'top',    org:'ai' },
  { email:'ai02@synapsoft.com',       pw:'user1234',  role:'user',   name:'신연구',  dept:'개발본부', title:'AI연구원',   mgr:'ai-lead', profile:'good',   org:'ai' },
  { email:'ai03@synapsoft.com',       pw:'user1234',  role:'user',   name:'류개발',  dept:'개발본부', title:'개발자',     mgr:'ai-lead', profile:'average',org:'ai' },
  { email:'ai04@synapsoft.com',       pw:'user1234',  role:'user',   name:'문개발',  dept:'개발본부', title:'개발자',     mgr:'ai-lead', profile:'declining',org:'ai' },
  { email:'qa-lead@synapsoft.com',    pw:'user1234',  role:'user',   name:'강품질',  dept:'개발본부', title:'QA팀장',    mgr:'cto', profile:'good',   org:'qa' },
  { email:'qa01@synapsoft.com',       pw:'user1234',  role:'user',   name:'배QA',   dept:'개발본부', title:'QA엔지니어', mgr:'qa-lead', profile:'average',org:'qa' },
  { email:'qa02@synapsoft.com',       pw:'user1234',  role:'user',   name:'표QA',   dept:'개발본부', title:'QA엔지니어', mgr:'qa-lead', profile:'improving',org:'qa' },
  // ── 영업본부 ──
  { email:'domestic-lead@synapsoft.com', pw:'user1234', role:'user', name:'나영업장',dept:'영업본부', title:'국내영업팀장', mgr:'cso', profile:'good',   org:'domestic' },
  { email:'sales01@synapsoft.com',    pw:'user1234',  role:'user',   name:'민영업',  dept:'영업본부', title:'영업사원',   mgr:'domestic-lead', profile:'top',    org:'domestic' },
  { email:'sales02@synapsoft.com',    pw:'user1234',  role:'user',   name:'엄영업',  dept:'영업본부', title:'영업사원',   mgr:'domestic-lead', profile:'good',   org:'domestic' },
  { email:'sales03@synapsoft.com',    pw:'user1234',  role:'user',   name:'안영업',  dept:'영업본부', title:'영업사원',   mgr:'domestic-lead', profile:'poor',   org:'domestic' },
  { email:'sales04@synapsoft.com',    pw:'user1234',  role:'user',   name:'장영업',  dept:'영업본부', title:'영업사원',   mgr:'domestic-lead', profile:'average',org:'domestic' },
  { email:'partner-lead@synapsoft.com', pw:'user1234', role:'user',  name:'서파트너',dept:'영업본부', title:'파트너팀장', mgr:'cso', profile:'good',   org:'partner' },
  { email:'partner01@synapsoft.com',  pw:'user1234',  role:'user',   name:'전파트너',dept:'영업본부', title:'파트너매니저',mgr:'partner-lead', profile:'average',org:'partner' },
  { email:'partner02@synapsoft.com',  pw:'user1234',  role:'user',   name:'추파트너',dept:'영업본부', title:'파트너매니저',mgr:'partner-lead', profile:'improving',org:'partner' },
  // ── 경영지원본부 ──
  { email:'hr-lead@synapsoft.com',    pw:'admin1234', role:'master', name:'홍인사',  dept:'경영지원', title:'인사팀장',  mgr:'cfo', profile:'good',   org:'hr' },
  { email:'hr01@synapsoft.com',       pw:'user1234',  role:'admin',  name:'고인사',  dept:'경영지원', title:'인사담당',  mgr:'hr-lead', profile:'average',org:'hr' },
  { email:'hr02@synapsoft.com',       pw:'user1234',  role:'admin',  name:'차인사',  dept:'경영지원', title:'인사담당',  mgr:'hr-lead', profile:'good',   org:'hr' },
  { email:'finance-lead@synapsoft.com', pw:'user1234', role:'user',  name:'유재무장',dept:'경영지원', title:'재무팀장',  mgr:'cfo', profile:'average',org:'finance' },
  { email:'finance01@synapsoft.com',  pw:'user1234',  role:'user',   name:'도재무',  dept:'경영지원', title:'재무담당',  mgr:'finance-lead', profile:'average',org:'finance' },
  { email:'finance02@synapsoft.com',  pw:'user1234',  role:'user',   name:'석재무',  dept:'경영지원', title:'재무담당',  mgr:'finance-lead', profile:'poor',   org:'finance' },
  // ── 마케팅팀 ──
  { email:'mkt-lead@synapsoft.com',   pw:'user1234',  role:'user',   name:'남마케터',dept:'마케팅',   title:'마케팅팀장', mgr:'ceo', profile:'good',   org:'mkt' },
  { email:'mkt01@synapsoft.com',      pw:'user1234',  role:'user',   name:'심마케터',dept:'마케팅',   title:'마케터',    mgr:'mkt-lead', profile:'good',   org:'mkt' },
  { email:'mkt02@synapsoft.com',      pw:'user1234',  role:'user',   name:'왕마케터',dept:'마케팅',   title:'마케터',    mgr:'mkt-lead', profile:'average',org:'mkt' },
  { email:'mkt03@synapsoft.com',      pw:'user1234',  role:'user',   name:'봉마케터',dept:'마케팅',   title:'마케터',    mgr:'mkt-lead', profile:'improving',org:'mkt' },
];

// ── 조직 구조 ─────────────────────────────────────────────────────────────
const ORG_TREE = [
  { key:'root',     name:'㈜사이냅소프트', parent:null,     leader:'ceo',          sort:0 },
  { key:'devhq',    name:'개발본부',       parent:'root',   leader:'cto',          sort:1 },
  { key:'saleshq',  name:'영업본부',       parent:'root',   leader:'cso',          sort:2 },
  { key:'mgmt',     name:'경영지원본부',   parent:'root',   leader:'cfo',          sort:3 },
  { key:'mkt',      name:'마케팅팀',       parent:'root',   leader:'mkt-lead',     sort:4 },
  { key:'platform', name:'플랫폼팀',       parent:'devhq',  leader:'platform-lead',sort:1 },
  { key:'ai',       name:'AI팀',           parent:'devhq',  leader:'ai-lead',      sort:2 },
  { key:'qa',       name:'QA팀',           parent:'devhq',  leader:'qa-lead',      sort:3 },
  { key:'domestic', name:'국내영업팀',     parent:'saleshq',leader:'domestic-lead',sort:1 },
  { key:'partner',  name:'파트너팀',       parent:'saleshq',leader:'partner-lead', sort:2 },
  { key:'hr',       name:'인사팀',         parent:'mgmt',   leader:'hr-lead',      sort:1 },
  { key:'finance',  name:'재무팀',         parent:'mgmt',   leader:'finance-lead', sort:2 },
];

// ── 목표 풀 (직무별·카테고리별) ────────────────────────────────────────────
const GOAL_POOLS = {
  dev: {
    업적목표: ['플랫폼 v3 출시 마일스톤 달성','API 응답속도 20% 개선','신규 기능 일정 내 배포','코드 커버리지 80% 이상 유지','운영장애 발생건수 0건 달성'],
    업무능력: ['기술 스택 심화 학습(주 1회 스터디)','코드리뷰 품질 개선(댓글 평균 3개 이상)','사내 기술 공유 세션 2회 이상'],
    근무태도: ['일일 스탠드업 참석률 95% 이상','팀 협업 도구 활용 준수','회의 자료 사전 준비 100%'],
  },
  ai: {
    업적목표: ['추천 모델 정밀도 85% 달성','모델 학습 파이프라인 자동화 완성','연구 결과 내부 공유 2건 이상'],
    업무능력: ['최신 논문 리뷰 월 2건','Python/PyTorch 코드 품질 개선','데이터 분석 역량 고도화'],
    근무태도: ['실험 결과 문서화 준수','팀 내 지식 공유 적극 참여','일정 준수율 90% 이상'],
  },
  sales: {
    업적목표: ['분기 매출 목표 100% 달성','신규 고객사 3곳 이상 발굴','계약 갱신율 90% 이상 유지'],
    업무능력: ['제품 데모 역량 강화(월 2회 실습)','CRM 데이터 정확도 95% 유지','고객 니즈 파악 능력 향상'],
    근무태도: ['고객 미팅 사전 준비 철저','내부 보고서 기한 준수','팀 내 성공 사례 공유'],
  },
  mgmt: {
    업적목표: ['결산 마감 일정 100% 준수','규정 위반 0건 달성','임직원 만족도 조사 80점 이상'],
    업무능력: ['관련 법규 및 규정 업데이트 추적','전문 자격증 취득 또는 갱신','프로세스 개선 제안 1건 이상'],
    근무태도: ['기밀 정보 보안 준수 100%','타부서 요청 처리 기한 준수','정기 보고 누락 0건'],
  },
  mkt: {
    업적목표: ['마케팅 캠페인 KPI 100% 달성','브랜드 인지도 조사 점수 향상','콘텐츠 제작 월 4건 이상'],
    업무능력: ['SNS 트렌드 분석 역량 강화','마케팅 툴 활용 능숙도 향상','데이터 기반 성과 분석'],
    근무태도: ['캠페인 일정 준수율 95%','크리에이티브 피드백 수용','팀 브리핑 자료 정시 제출'],
  },
};

function getGoalPool(email) {
  if (email.includes('ai')) return GOAL_POOLS.ai;
  if (email.includes('qa') || email.includes('dev') || email.includes('platform') || email.includes('cto')) return GOAL_POOLS.dev;
  if (email.includes('sales') || email.includes('domestic') || email.includes('partner') || email.includes('cso')) return GOAL_POOLS.sales;
  if (email.includes('mkt')) return GOAL_POOLS.mkt;
  return GOAL_POOLS.mgmt;
}

// ── 중간보고 뱅크 ──────────────────────────────────────────────────────────
const REPORT_BANK = [
  '목표 대비 진행률 75% 달성. 주요 이슈 없이 정상 진행 중.',
  '1·2차 마일스톤 완료. 3차 준비 중, 일정 내 완료 예정.',
  '진행 중 경쟁사 동향 변화 감지. 전략 일부 조정하여 목표 유지.',
  '팀원과 협력하여 예상보다 빠른 속도로 진행 중. 추가 목표 설정 검토.',
  '예상 이슈 발생했으나 조기 해결. 현재 정상 궤도.',
  '자기계발 목표 이수율 100%. 업무 적용 방안 모색 중.',
  '고객 피드백 반영하여 접근 방식 개선. 긍정적 결과 기대.',
  '분기 초 목표 재조정으로 현재 목표와 실적 정합성 높음.',
  '협업 프로젝트에서 팀 기여도 높았음. 주도적 역할 수행.',
  '도전적인 목표임에도 현재 예상치 이상의 성과 달성 중.',
];

// ── 피드백 뱅크 (점수대별) ────────────────────────────────────────────────
const FEEDBACK_BANK = {
  high: [  // 상위 (4~5점 평균)
    '기대를 뛰어넘는 성과를 보여주었습니다. 핵심 목표를 조기 달성하며 팀에 큰 기여를 했습니다.',
    '탁월한 전문성과 추진력으로 목표를 달성했습니다. 팀 분위기에도 긍정적인 영향을 미쳤습니다.',
    '높은 수준의 결과물과 일관된 성과로 팀의 기대치를 상회했습니다.',
  ],
  mid: [  // 중위 (3점 평균)
    '목표 대부분을 달성했습니다. 일부 개선이 필요하지만 전반적으로 안정적인 성과입니다.',
    '기본 역할을 충실히 수행했습니다. 다음 분기에는 보다 적극적인 도전이 기대됩니다.',
    '꾸준한 성과를 유지하고 있습니다. 전문성 강화를 위한 추가 노력이 도움이 될 것입니다.',
  ],
  low: [  // 하위 (2점 이하 평균)
    '목표 달성에 어려움이 있었습니다. 구체적인 개선 계획 수립이 필요합니다.',
    '일부 핵심 목표가 미달되었습니다. 원인 분석과 재발 방지 방안을 함께 논의해야 합니다.',
    '현재 성과 수준을 높이기 위한 적극적인 노력이 필요합니다. 지원이 필요하면 말씀해 주세요.',
  ],
};

// ── 점수 프로필 (기간별 mgr_score 패턴, 1~5 정수) ──────────────────────────
function getScoreForPeriod(profile, periodIdx) {
  // periodIdx: 0=2024Q1, ..., 8=2026Q1
  const rng = seededRand(profile + periodIdx * 7919);
  switch(profile) {
    case 'top':      return [4,4,5,4,5,5,4,5,5][periodIdx] || 4;
    case 'good':     return [4,3,4,4,3,4,4,4,3][periodIdx] || 4;
    case 'average':  return [3,3,3,3,3,3,3,3,3][periodIdx] || 3;
    case 'improving':return [2,2,3,3,3,3,4,4,4][periodIdx] || 3;
    case 'declining':return [4,4,4,3,3,3,2,3,2][periodIdx] || 3;
    case 'poor':     return [2,2,2,3,2,2,2,3,2][periodIdx] || 2;
    default:         return 3;
  }
}
function seededRand(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function pick(arr, seed) {
  return arr[Math.floor(seededRand(seed) * arr.length)];
}

// ── 리셋 (사용자·평가 데이터 wipe, config 보존) ────────────────────────────
async function resetEvalData() {
  console.log('🗑  평가 데이터 초기화 (config 보존)...');
  await prisma.finalEvalScore.deleteMany();
  await prisma.finalEvaluation.deleteMany();
  await prisma.feedbackItem.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.progressReport.deleteMany();
  await prisma.goalApproval.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.evalCycle.deleteMany();
  await prisma.evalPeriodMode.deleteMany();
  await prisma.evalPeriod.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  // 보존: app_settings, grade_policies, grade_policy_criteria, goal_categories
  console.log('   ✅ 초기화 완료 (정책·카테고리·설정 보존)');
}

// ── 메인 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌱 seed-demo.js 시작 (DEMO 전용 — 운영 DB에서 실행 금지)\n');

  // 1. IR min_score 0→40 교정
  const irResult = await prisma.gradePolicyCriteria.updateMany({
    where: { gradeCode: 'IR' },
    data: { minScore: 40 },
  });
  console.log(`📊 IR min_score 교정: ${irResult.count}건 (0→40)`);

  // 등급 criteria 로드 (min_score DESC)
  const criteria = await prisma.gradePolicyCriteria.findMany({
    orderBy: { minScore: 'desc' },
  });
  const criteriaPlain = criteria.map(c => ({ grade_code: c.gradeCode, min_score: Number(c.minScore) }));

  // goal_categories 로드
  const cats = await prisma.goalCategory.findMany({ where: { isActive: 1 }, orderBy: { sortOrder: 'asc' } });
  if (cats.length < 3) throw new Error('카테고리 3개 필요 (seed-pg.js 먼저 실행하세요)');

  // 2. 데이터 초기화
  await resetEvalData();

  // 3. 사용자 생성
  console.log('\n👥 사용자 생성 (35명)...');
  const emailToId = {};
  for (const u of ROSTER) {
    const hash = bcrypt.hashSync(u.pw, 10);
    const created = await prisma.user.create({
      data: { name: u.name, email: u.email, passwordHash: hash, role: u.role, dept: u.dept, title: u.title, isActive: 1, accountStatus: 'approved' },
    });
    emailToId[u.email] = created.id;
  }
  // manager_id 연결
  for (const u of ROSTER) {
    if (u.mgr) {
      const mgrEmail = u.mgr.includes('@') ? u.mgr : `${u.mgr}@synapsoft.com`;
      const mgrId = emailToId[mgrEmail];
      if (mgrId) await prisma.user.update({ where: { id: emailToId[u.email] }, data: { managerId: mgrId } });
    }
  }
  console.log(`   ✅ ${ROSTER.length}명 생성 완료`);

  // 4. 조직 생성
  console.log('\n🏢 조직 생성...');
  const orgKeyToId = {};
  // 루트 먼저
  for (const o of ORG_TREE.filter(x => !x.parent)) {
    const leaderEmail = o.leader.includes('@') ? o.leader : `${o.leader}@synapsoft.com`;
    const org = await prisma.organization.create({
      data: { name: o.name, leaderId: emailToId[leaderEmail] || null, parentId: null, sortOrder: o.sort, isActive: 1 },
    });
    orgKeyToId[o.key] = org.id;
  }
  // 나머지
  for (const o of ORG_TREE.filter(x => x.parent)) {
    const leaderEmail = o.leader.includes('@') ? o.leader : `${o.leader}@synapsoft.com`;
    const org = await prisma.organization.create({
      data: { name: o.name, leaderId: emailToId[leaderEmail] || null, parentId: orgKeyToId[o.parent], sortOrder: o.sort, isActive: 1 },
    });
    orgKeyToId[o.key] = org.id;
  }
  // 사용자 → org 매핑
  for (const u of ROSTER) {
    const orgId = orgKeyToId[u.org];
    if (orgId) await prisma.user.update({ where: { id: emailToId[u.email] }, data: { orgId } });
  }
  console.log(`   ✅ ${ORG_TREE.length}개 조직 생성 완료`);

  // 5. 평가 기간 생성
  console.log('\n📅 평가 기간 생성...');
  const policy = await prisma.gradePolicy.findFirst({ orderBy: { id: 'asc' } });
  const periodIdByLabel = {};
  for (let i = 0; i < PERIODS.length; i++) {
    const p = PERIODS[i];
    const ep = await prisma.evalPeriod.create({
      data: {
        periodType: 'quarter',
        periodLabel: p.label,
        evalYear: p.year,
        isActive: 1,
        evalMode: 'MBO',
        locked: 0,
        gradePolicyId: policy?.id || null,
      },
    });
    periodIdByLabel[p.label] = ep.id;
  }
  console.log(`   ✅ ${PERIODS.length}개 기간 생성`);

  // 6. 평가 데이터 생성
  let totalCycles = 0, totalGoals = 0, totalReports = 0, totalFeedbacks = 0, totalFinals = 0;
  const gradeCount = {};

  console.log('\n📋 평가 사이클 생성 중...');

  for (const u of ROSTER) {
    const userId = emailToId[u.email];
    const goalPool = getGoalPool(u.email);
    const catKeys = Object.keys(goalPool);  // ['업적목표','업무능력','근무태도']

    // ── 완료 기간 (2024Q1 ~ 2026Q1) ──────────────────────────────────────
    for (let pIdx = 0; pIdx < COMPLETED_COUNT; pIdx++) {
      const period = PERIODS[pIdx];
      const seed = u.email.length * 1000 + pIdx * 100;

      const cycle = await prisma.evalCycle.create({
        data: {
          userId,
          periodType: 'quarter',
          periodLabel: period.label,
          evalYear: period.year,
          phase: 'final_done',
          locked: 1,
        },
      });
      totalCycles++;

      // 목표 생성 (카테고리별 2~3개, 가중치 합=100)
      const goalIds = {};
      for (let ci = 0; ci < cats.length; ci++) {
        const cat = cats[ci];
        const catKey = catKeys[ci] || catKeys[0];
        const pool = goalPool[catKey] || goalPool[Object.keys(goalPool)[0]];
        const goalCount = ci === 0 ? 3 : 2;
        const weights = ci === 0 ? [40, 30, 30] : [60, 40];
        goalIds[cat.id] = [];
        for (let gi = 0; gi < goalCount; gi++) {
          const goalName = pick(pool, seed + ci * 10 + gi);
          const g = await prisma.goal.create({
            data: {
              evalId: cycle.id,
              categoryId: cat.id,
              name: goalName,
              kpi: `분기 목표 KPI_${gi + 1}`,
              weight: weights[gi],
              sortOrder: gi,
              status: 'approved',
            },
          });
          goalIds[cat.id].push(g.id);
          totalGoals++;
        }
      }

      // 목표 승인 (결재 레코드)
      const mgrUser = ROSTER.find(r => r.email === u.email);
      const mgrEmail = mgrUser?.mgr?.includes('@') ? mgrUser.mgr : mgrUser?.mgr ? `${mgrUser.mgr}@synapsoft.com` : null;
      const mgrId = mgrEmail ? emailToId[mgrEmail] : null;
      if (mgrId) {
        await prisma.goalApproval.create({
          data: { evalId: cycle.id, approverId: mgrId, level: 1, action: 'approved', note: null },
        });
        if (APPROVAL_2CHA_EMAILS.has(u.email)) {
          const ctoId = emailToId['cto@synapsoft.com'];
          if (ctoId) await prisma.goalApproval.create({
            data: { evalId: cycle.id, approverId: ctoId, level: 2, action: 'approved', note: null },
          });
        }
      }

      // 중간보고 (2회)
      for (let ri = 0; ri < 2; ri++) {
        const firstGoalId = Object.values(goalIds)[0]?.[0] || null;
        await prisma.progressReport.create({
          data: {
            evalId: cycle.id,
            authorId: userId,
            content: pick(REPORT_BANK, seed + ri * 37),
            goalId: firstGoalId,
            round: ri + 1,
          },
        });
        totalReports++;
      }

      // 피드백
      const mgrScore = getScoreForPeriod(u.profile, pIdx);
      const fbBand = mgrScore >= 4 ? 'high' : mgrScore === 3 ? 'mid' : 'low';
      const fb = await prisma.feedback.create({
        data: { evalId: cycle.id, authorId: mgrId || userId, overallNote: pick(FEEDBACK_BANK[fbBand], seed + 77) },
      });
      // 피드백 items
      for (const [catId, gids] of Object.entries(goalIds)) {
        for (const gid of gids) {
          await prisma.feedbackItem.create({
            data: { feedbackId: fb.id, goalId: gid, score: Math.min(5, Math.max(1, mgrScore + Math.round((seededRand(seed + gid) - 0.5)))), note: null },
          });
        }
      }
      totalFeedbacks++;

      // final_eval_scores (self + mgr)
      const selfScore = Math.min(5, Math.max(1, mgrScore + (seededRand(seed + 13) > 0.5 ? 0 : (seededRand(seed + 17) > 0.5 ? 1 : -1))));
      const fe = await prisma.finalEvaluation.create({
        data: {
          evalId: cycle.id,
          selfDone: 1,
          self_done_at: `${period.year.slice(0, 4)}-0${(pIdx % 4) + 1}-15 10:00:00`,
          mgrDone: 1,
          mgr_done_at: `${period.year.slice(0, 4)}-0${(pIdx % 4) + 1}-20 14:00:00`,
          mgrApproverId: mgrId || userId,
          locked: 1,
          locked_at: `${period.year.slice(0, 4)}-0${(pIdx % 4) + 1}-20 14:00:00`,
        },
      });
      // final_eval_scores 행
      for (const [catId, gids] of Object.entries(goalIds)) {
        for (const gid of gids) {
          await prisma.finalEvalScore.create({
            data: { finalId: fe.id, goalId: gid, selfScore, mgrScore },
          });
        }
      }

      // calcFinalScore 호출 (앱 로직 재사용)
      const rawScore = await adminRepo.calcFinalScore(cycle.id, 'mgr_score');
      const finalScore = rawScore !== null ? Math.round(rawScore * 10) / 10 : null;
      const grade = finalScore !== null ? scoreToGrade(finalScore, criteriaPlain) : null;

      await prisma.finalEvaluation.update({
        where: { id: fe.id },
        data: {
          selfNote: `자기평가: ${period.label} 목표를 성실히 수행하였습니다.`,
          mgrNote: pick(FEEDBACK_BANK[fbBand], seed + 99),
          finalScore,
          finalGrade: grade,
          selectedGrade: grade,
        },
      });

      if (grade) { gradeCount[grade] = (gradeCount[grade] || 0) + 1; }
      totalFinals++;
    }

    // ── 진행 중 (2026Q2) ──────────────────────────────────────────────────
    const currentPeriod = PERIODS[COMPLETED_COUNT];  // 2026Q2
    const is2Cha = CHAIN_2CHA_EMAILS.has(u.email);  // 2차 대기 대상 여부

    const cycle2 = await prisma.evalCycle.create({
      data: {
        userId,
        periodType: 'quarter',
        periodLabel: currentPeriod.label,
        evalYear: currentPeriod.year,
        // 2차 대기 대상: 1차 완료 후 2차 대기 / 나머지: 자기평가 진행중
        phase: is2Cha ? 'final_mgr2_pending' : 'final_self',
        locked: 0,
      },
    });
    totalCycles++;

    // 목표 (승인된 상태)
    const goalPool2 = getGoalPool(u.email);
    const cat2Keys = Object.keys(goalPool2);
    const seed2 = u.email.length * 2000 + 999;
    for (let ci = 0; ci < cats.length; ci++) {
      const cat = cats[ci];
      const catKey = cat2Keys[ci] || cat2Keys[0];
      const pool2 = goalPool2[catKey] || goalPool2[Object.keys(goalPool2)[0]];
      const goalCount = ci === 0 ? 3 : 2;
      const weights = ci === 0 ? [40, 30, 30] : [60, 40];
      for (let gi = 0; gi < goalCount; gi++) {
        await prisma.goal.create({
          data: {
            evalId: cycle2.id,
            categoryId: cat.id,
            name: pick(pool2, seed2 + ci * 10 + gi),
            kpi: `2026Q2 KPI_${gi + 1}`,
            weight: weights[gi],
            sortOrder: gi,
            status: 'approved',
          },
        });
        totalGoals++;
      }
    }

    // 결재
    const mgrUser2 = ROSTER.find(r => r.email === u.email);
    const mgrEmail2 = mgrUser2?.mgr?.includes('@') ? mgrUser2.mgr : mgrUser2?.mgr ? `${mgrUser2.mgr}@synapsoft.com` : null;
    const mgrId2 = mgrEmail2 ? emailToId[mgrEmail2] : null;
    if (mgrId2) {
      await prisma.goalApproval.create({
        data: { evalId: cycle2.id, approverId: mgrId2, level: 1, action: 'approved' },
      });
      if (APPROVAL_2CHA_EMAILS.has(u.email)) {
        const ctoId2 = emailToId['cto@synapsoft.com'];
        if (ctoId2) await prisma.goalApproval.create({
          data: { evalId: cycle2.id, approverId: ctoId2, level: 2, action: 'approved' },
        });
      }
    }

    // 중간보고 1회
    await prisma.progressReport.create({
      data: {
        evalId: cycle2.id,
        authorId: userId,
        content: pick(REPORT_BANK, seed2 + 7),
        round: 1,
      },
    });
    totalReports++;

    if (is2Cha) {
      // ── 2차 평가 대기: 자기평가 + 1차 최종평가 완료 상태 생성 ──────────
      // final_eval_scores (1차 mgr_score — 앱 점수 로직 재사용 전제)
      const mgrScore2 = getScoreForPeriod(u.profile, COMPLETED_COUNT - 1);  // 마지막 완료 기간 점수 재사용
      const selfScore2 = Math.min(5, Math.max(1, mgrScore2));
      const fe2 = await prisma.finalEvaluation.create({
        data: {
          evalId: cycle2.id,
          selfDone: 1,
          self_done_at: '2026-06-01 09:00:00',
          selfNote: '2026년 2분기 자기평가 완료. 목표 달성을 위해 최선을 다했습니다.',
          mgrDone: 1,
          mgr_done_at: '2026-06-03 14:00:00',
          mgrNote: '1차 평가 완료. 성실하게 임무를 수행하였습니다.',
          mgrApproverId: mgrId2 || userId,
          locked: 0,        // 2차 미완료라 잠금 해제
          secondMgrDone: 0, // 2차 미완료
        },
      });
      // final_eval_scores (1차 점수 삽입)
      const allGoals2 = await prisma.goal.findMany({ where: { evalId: cycle2.id } });
      for (const g of allGoals2) {
        await prisma.finalEvalScore.create({
          data: { finalId: fe2.id, goalId: g.id, selfScore: selfScore2, mgrScore: mgrScore2 },
        });
      }
      // 앱 calcFinalScore 로직으로 점수·등급 산출 (시드↔런타임 일치)
      const rawScore2 = await adminRepo.calcFinalScore(cycle2.id, 'mgr_score');
      const finalScore2 = rawScore2 !== null ? Math.round(rawScore2 * 10) / 10 : null;
      const grade2 = finalScore2 !== null ? scoreToGrade(finalScore2, criteriaPlain) : null;
      await prisma.finalEvaluation.update({
        where: { id: fe2.id },
        data: { finalScore: finalScore2, finalGrade: grade2, selectedGrade: grade2 },
      });
      if (grade2) { gradeCount[grade2] = (gradeCount[grade2] || 0) + 1; }

      // ── 목표별 중간보고 1회차 (dev01/dev02 데모 — CTX-2 펼침용) ──────────
      const goalRptBank = [
        '목표 달성을 위한 핵심 과제 분석 및 실행 계획 수립 완료. 1분기 대비 15% 향상된 성과 기록 중.',
        '현재 KPI 지표가 기준치를 상회하고 있습니다. 팀원과 협력하여 목표 달성에 집중하고 있습니다.',
        '마일스톤의 65% 달성. 외부 요인으로 일부 조정이 있었으나 전체 일정에는 영향 없음.',
        '핵심 기능 구현 완료 후 품질 검토 단계 진행 중입니다. 다음 단계 준비도 병행하고 있습니다.',
        '계획 대비 순항 중. 잔여 과제에 대한 구체적 해결 방안을 마련하여 진행하고 있습니다.',
      ];
      for (let gi = 0; gi < allGoals2.length; gi++) {
        await prisma.progressReport.create({
          data: {
            evalId: cycle2.id,
            authorId: userId,
            content: goalRptBank[gi % goalRptBank.length],
            goalId: allGoals2[gi].id,
            round: 1,
          },
        });
        totalReports++;
      }
    } else {
      // ── 일반 진행중: 자기평가 미완료 ──────────────────────────────────
      await prisma.finalEvaluation.create({
        data: { evalId: cycle2.id, selfDone: 0, mgrDone: 0, locked: 0 },
      });
    }
  }

  // 7. 통계 출력
  console.log('\n📊 생성 통계:');
  console.log(`  인원:      ${ROSTER.length}명`);
  console.log(`  평가 기간: ${PERIODS.length}개 (완료 ${COMPLETED_COUNT}, 진행중 1)`);
  console.log(`  사이클:    ${totalCycles}건`);
  console.log(`  목표:      ${totalGoals}건`);
  console.log(`  중간보고:  ${totalReports}건`);
  console.log(`  피드백:    ${totalFeedbacks}건`);
  console.log(`  최종평가:  ${totalFinals}건 (완료)`);
  console.log(`  등급분포:  ${JSON.stringify(gradeCount)}`);

  // 8. 데모 계정 비번 고정 + 공지 업데이트 (시연용)
  console.log('\n🔑 데모 계정 비번 고정 (시연 라인: 한개발→정플랫→박기술)...');
  const DEMO_PW_TARGETS = [
    { name: '박기술', pw: 'admin1234' },
    { name: '정플랫', pw: 'user1234'  },
    { name: '한개발', pw: 'user1234'  },
  ];
  let devEmail = 'dev01@synapsoft.com';
  for (const t of DEMO_PW_TARGETS) {
    const u = await prisma.user.findFirst({ where: { name: t.name }, select: { id: true, email: true } });
    if (u) {
      const hash = bcrypt.hashSync(t.pw, 10);
      await prisma.user.update({ where: { id: u.id }, data: { passwordHash: hash } });
      if (t.name === '한개발') devEmail = u.email;
    }
  }

  const demoNotice = `📢 데모 테스트 계정
[마스터관리자] ceo@synapsoft.com / admin1234       (이대표 — 전사)
[마스터관리자] hr-lead@synapsoft.com / admin1234   (홍인사 인사팀장 — 전사)
[일반관리자]   hr01@synapsoft.com / user1234       (고인사 인사담당 — 전사)
[개발본부장]   cto@synapsoft.com / admin1234       (박기술 — 개발본부 하부)
[플랫폼팀장]   platform-lead@synapsoft.com / user1234 (정플랫 — 팀 하부)
[시니어개발자] ${devEmail} / user1234              (한개발)`;
  await prisma.appSetting.upsert({
    where:  { key: 'notice' },
    update: { value: demoNotice, updatedBy: 1 },
    create: { key: 'notice', value: demoNotice, updatedBy: 1 },
  });
  // 2차 최종평가 허용 on (박기술 2차 시연용)
  await prisma.appSetting.upsert({
    where:  { key: 'second_final' },
    update: { value: '1' },
    create: { key: 'second_final', value: '1' },
  });
  console.log('  ✅ 공지 + 2차 최종평가 허용(on) 업데이트 완료');

  console.log('\n🔑 알려진 테스트 로그인 계정:');
  console.log('  대표이사:  ceo@synapsoft.com / admin1234');
  console.log('  인사팀장:  hr-lead@synapsoft.com / admin1234');
  console.log('  개발본부장:cto@synapsoft.com / admin1234  (박기술 — 결재 2차)');
  console.log('  플랫폼팀장:platform-lead@synapsoft.com / user1234 (정플랫 — 결재 1차)');
  console.log('  시니어개발:' + devEmail + ' / user1234 (한개발 — 평가자)');

  console.log('\n✅ seed-demo.js 완료');
  console.log('\n💡 테스트서버 적재:');
  console.log('  docker compose --profile postgres run --rm app node scripts/seed-demo.js');
  console.log('\n💡 리셋 재적재: 동일 명령 재실행 (멱등)');
}

main().catch(e => {
  console.error('\n❌ 시드 실패:', e.message);
  console.error(e.stack);
  process.exit(1);
}).finally(() => prisma.$disconnect());
