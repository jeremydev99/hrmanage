# CLAUDE_CODE_PROMPT_59 — 시드 데이터 생성 스크립트 (AI 분석용 9분기 데이터)

## 작업 개요

AI 분석(PROMPT 58)이 의미 있는 결과를 산출할 수 있도록 9분기 분량의 평가 시드 데이터를 자동 생성. 기존 사용자 임의 입력 데이터는 백업 후 정리.

**사용자 결정 사항 (2026-05-27)**:

| 항목 | 결정 |
|------|------|
| 평가 기간 | 2024-1Q ~ 2026-1Q (9분기). 2024·2025년 분기 없으면 신규 생성 |
| 시드 계정 | 8명 모두 (CEO 포함) 평가 대상 |
| 카테고리 가중치 | 기존 DB 그대로 (업적목표 50%, 업무능력, 근무태도) |
| 카테고리당 과제 | 2개씩 = 총 6개 과제 |
| 과제 비중 (카테고리 내) | 70:30 또는 60:40 무작위 |
| 시나리오 분배 | 개발팀→제품개발, 영업팀→제품판매, 인사팀→인사관리, CEO→경영 |
| 중간보고·피드백 횟수 | 목표당 2~5회 불규칙 |
| 평가 단계 | 과거 분기 모두 final_done, 가장 최근 분기(2026-1Q)만 진행 중 |
| 점수·등급 분포 | 시나리오 기반 트렌드 (개발 변동, 영업 상승, 인사 안정) |
| 기존 데이터 처리 | 전체 삭제 + 백업 (자동) |
| 실행 방식 | `node scripts/seed-eval-data.js` 1회 실행 |

## 작업 위험도: 상 (DB 데이터 전체 교체, 백업 필수)
## 자동 푸시 여부: ⚠️ 회색 지대 — 검증 후 수동 푸시. **DB 백업 확인 필수**

## 사전 확인 (작업 시작 전 필수)

### 1. 카테고리 데이터 확인
```bash
sqlite3 data/hrmanage.db "SELECT id, name, weight, sort_order, is_active FROM goal_categories WHERE is_active=1 ORDER BY sort_order;"
```

기대 결과: 업적목표(50%), 업무능력(?%), 근무태도(?%) 3개 카테고리. 가중치 비율 확인.

### 2. 등급 데이터 확인
```bash
sqlite3 data/hrmanage.db "SELECT id, grade_code, grade_name, sort_order FROM grade_criteria WHERE is_active=1 ORDER BY sort_order;"
```

등급 개수 확인 (예: S/A/B/C/D 5개 또는 다른 체계).

### 3. 사용자·조직 데이터 확인
```bash
sqlite3 data/hrmanage.db "SELECT id, name, email, role, dept, manager_id, org_id FROM users WHERE is_active=1;"
sqlite3 data/hrmanage.db "SELECT id, name, parent_id, leader_id FROM organizations WHERE is_active=1;"
```

조직도 + manager_id 체인 확인. 시드 시 이 관계 활용.

### 4. 기존 평가 데이터 양 확인
```bash
sqlite3 data/hrmanage.db "SELECT COUNT(*) FROM eval_cycles; SELECT COUNT(*) FROM goals; SELECT COUNT(*) FROM final_evaluations;"
```

삭제 전 양을 알아둠.

## 작업 절차

### 1. 스크립트 디렉토리 생성

```bash
mkdir -p scripts
```

### 2. 시드 데이터 스크립트 작성

**파일**: `scripts/seed-eval-data.js`

스크립트 구조:

```javascript
/**
 * 시드 데이터 생성 스크립트
 * 
 * 용도: AI 분석 검증을 위한 9분기 평가 데이터 자동 생성
 * 실행: node scripts/seed-eval-data.js
 * 
 * 동작:
 * 1. 백업: data/hrmanage.db → data/hrmanage.db.bak.before-seed-{timestamp}
 * 2. 기존 평가 데이터 삭제 (users/organizations/grade_criteria/goal_categories 유지)
 * 3. 평가 기간 9개 보장 (2024-1Q ~ 2026-1Q)
 * 4. 8명 사용자별 9분기 × 6개 과제 평가 사이클 생성
 * 5. 각 평가에 중간보고·피드백·최종평가·점수 채우기
 * 6. 통계 출력
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'hrmanage.db');
const ENC_SECRET = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';

// === 암호화 (server/index.js와 동일) ===
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENC_SECRET, 'salt', 32);
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

// === 백업 ===
function backup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bakPath = `${DB_PATH}.bak.before-seed-${ts}`;
  fs.copyFileSync(DB_PATH, bakPath);
  console.log(`✅ 백업: ${bakPath}`);
  return bakPath;
}

// === 메인 ===
async function main() {
  console.log('🌱 시드 데이터 생성 시작\n');
  
  const bakPath = backup();
  
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  
  try {
    // 트랜잭션
    const tx = db.transaction(() => {
      cleanupOldData(db);
      const periods = ensurePeriods(db);
      const users = loadUsers(db);
      const categories = loadCategories(db);
      const grades = loadGrades(db);
      
      console.log(`📋 사용자 ${users.length}명, 카테고리 ${categories.length}개, 등급 ${grades.length}개`);
      console.log(`📅 평가 기간 ${periods.length}개\n`);
      
      let totalCycles = 0;
      let totalGoals = 0;
      let totalApprovals = 0;
      let totalReports = 0;
      let totalFeedbacks = 0;
      let totalFinals = 0;
      
      for (const user of users) {
        for (const period of periods) {
          const isCurrentPeriod = isLatestPeriod(period, periods);
          const result = createEvalForUser(db, user, period, categories, grades, isCurrentPeriod);
          totalCycles++;
          totalGoals += result.goals;
          totalApprovals += result.approvals;
          totalReports += result.reports;
          totalFeedbacks += result.feedbacks;
          if (result.finalCreated) totalFinals++;
        }
      }
      
      console.log('\n📊 생성 통계:');
      console.log(`  - 평가 사이클: ${totalCycles}`);
      console.log(`  - 목표: ${totalGoals}`);
      console.log(`  - 승인 이력: ${totalApprovals}`);
      console.log(`  - 중간보고: ${totalReports}`);
      console.log(`  - 피드백: ${totalFeedbacks}`);
      console.log(`  - 최종평가: ${totalFinals}`);
    });
    
    tx();
    
    console.log('\n✅ 시드 데이터 생성 완료');
    console.log(`💾 백업 위치: ${bakPath}`);
    console.log('⚠️  문제 발생 시: copy /Y ' + bakPath + ' ' + DB_PATH);
  } catch (err) {
    console.error('\n❌ 시드 생성 실패:', err);
    console.log(`🔄 백업에서 복원하려면: copy /Y "${bakPath}" "${DB_PATH}"`);
    process.exit(1);
  } finally {
    db.close();
  }
}

// === 기존 평가 데이터 정리 ===
function cleanupOldData(db) {
  console.log('🗑️  기존 평가 데이터 삭제...');
  // FK 순서 따라 자식부터
  db.prepare('DELETE FROM final_eval_scores').run();
  db.prepare('DELETE FROM final_evaluations').run();
  db.prepare('DELETE FROM report_files WHERE report_id IS NOT NULL').run();
  db.prepare('DELETE FROM progress_reports').run();
  db.prepare('DELETE FROM feedback_items').run();
  db.prepare('DELETE FROM feedbacks').run();
  db.prepare('DELETE FROM goal_approvals').run();
  db.prepare('DELETE FROM goals').run();
  db.prepare('DELETE FROM eval_cycles').run();
  // audit_logs는 유지 (기존 이력 보존)
  console.log('   ✅ 완료');
}

// === 평가 기간 9개 보장 ===
function ensurePeriods(db) {
  const targetPeriods = [
    { year: '2024', label: '1Q' },
    { year: '2024', label: '2Q' },
    { year: '2024', label: '3Q' },
    { year: '2024', label: '4Q' },
    { year: '2025', label: '1Q' },
    { year: '2025', label: '2Q' },
    { year: '2025', label: '3Q' },
    { year: '2025', label: '4Q' },
    { year: '2026', label: '1Q' },
  ];
  
  const periods = [];
  for (const t of targetPeriods) {
    let p = db.prepare(
      "SELECT * FROM eval_periods WHERE eval_year=? AND period_label=? AND period_type='quarter'"
    ).get(t.year, t.label);
    
    if (!p) {
      const result = db.prepare(`
        INSERT INTO eval_periods (period_type, period_label, eval_year, is_active, created_by, eval_mode, locked)
        VALUES ('quarter', ?, ?, 1, NULL, 'MBO', 0)
      `).run(t.label, t.year);
      p = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(result.lastInsertRowid);
      console.log(`   📅 신규 평가 기간 생성: ${t.year}-${t.label}`);
    }
    periods.push(p);
  }
  return periods;
}

function isLatestPeriod(p, all) {
  return p.id === all[all.length - 1].id;
}

// === 사용자·카테고리·등급 로드 ===
function loadUsers(db) {
  return db.prepare(`
    SELECT id, name, email, role, dept, title, manager_id, org_id 
    FROM users WHERE is_active=1 ORDER BY id
  `).all();
}

function loadCategories(db) {
  return db.prepare(`
    SELECT id, name, weight, sort_order 
    FROM goal_categories WHERE is_active=1 ORDER BY sort_order
  `).all();
}

function loadGrades(db) {
  return db.prepare(`
    SELECT id, grade_code, grade_name, sort_order 
    FROM grade_criteria WHERE is_active=1 ORDER BY sort_order
  `).all();
}

// === 부서별 시나리오 매칭 ===
function getScenarioForUser(user) {
  const dept = (user.dept || '').toLowerCase();
  if (user.email === 'ceo@synapsoft.com') return 'executive';
  if (dept.includes('개발') || user.email.includes('dev')) return 'development';
  if (dept.includes('영업') || user.email.includes('sales')) return 'sales';
  if (dept.includes('인사') || user.email.includes('hr')) return 'hr';
  return 'general';
}

// === 시나리오별 목표 풀 (가상 기업 시나리오) ===
const GOAL_TEMPLATES = {
  development: {
    achievement: [  // 업적목표
      { name: 'SaaS 플랫폼 v3.0 출시', kpi: '신규 기능 5개 출시, 안정성 99.5% 유지, 베타 고객사 10개 확보' },
      { name: 'AI 모듈 통합 개발', kpi: '추천 엔진 정확도 85% 이상, 응답 시간 200ms 이하' },
      { name: '레거시 시스템 마이그레이션', kpi: '구 시스템 기능 100% 이전, 다운타임 4시간 이하' },
      { name: '결제 게이트웨이 리팩토링', kpi: '에러율 0.1% 이하, 처리 속도 30% 개선' },
      { name: '모바일 앱 신규 출시', kpi: 'iOS/Android 동시 출시, 평점 4.0 이상' },
      { name: 'API 응답 속도 개선', kpi: '평균 응답 시간 50% 단축, P95 200ms 이하' },
    ],
    skill: [  // 업무능력
      { name: '기술 스택 확장 학습', kpi: '신규 프레임워크 1개 도입, 사내 기술 세미나 2회 발표' },
      { name: '코드 리뷰 품질 향상', kpi: '주간 5건 이상 리뷰, 리뷰 평균 응답 24시간 이내' },
      { name: '클라우드 아키텍처 자격증', kpi: 'AWS/NCP 관련 자격증 1개 취득' },
      { name: '오픈소스 기여', kpi: '기여 PR 3건 머지, 사내 라이브러리 1개 공개' },
    ],
    attitude: [  // 근무태도
      { name: '협업 및 커뮤니케이션', kpi: '스프린트 회의 100% 참석, 팀 만족도 4.0 이상' },
      { name: '주도적 문제 해결', kpi: '제안 안건 분기 2건 이상, 채택 1건 이상' },
      { name: '신입사원 멘토링', kpi: '신입 1인 전담 멘토링, 분기말 평가 만족도 4.5 이상' },
    ],
  },
  sales: {
    achievement: [
      { name: '신규 고객사 확보', kpi: '분기 신규 계약 5건 이상, 매출 5억 달성' },
      { name: '기존 고객 업셀링', kpi: '기존 고객 30% 추가 매출, 리텐션 90% 유지' },
      { name: '엔터프라이즈 고객 유치', kpi: '500인 이상 기업 2곳 신규 계약' },
      { name: '연간 매출 목표 달성', kpi: '연 매출 30억, 분기 7.5억 목표' },
      { name: '제휴 파트너십 확장', kpi: '신규 파트너 3개사 확보, 공동 영업 10건' },
      { name: '마케팅 캠페인 운영', kpi: '인바운드 리드 200건, 전환율 15% 달성' },
    ],
    skill: [
      { name: '제품 도메인 지식', kpi: '제품 교육 100% 이수, 인증 시험 90점 이상' },
      { name: '협상 스킬 향상', kpi: '협상 워크숍 참여, 평균 계약 단가 10% 상승' },
      { name: 'CRM 도구 활용', kpi: 'Salesforce 활용도 95%, 데이터 정합성 유지' },
      { name: '고객 인사이트 분석', kpi: '월간 시장 보고서 작성, 경영진 보고 정례화' },
    ],
    attitude: [
      { name: '고객 응대 만족도', kpi: 'NPS 60 이상, 고객 응답 4시간 이내' },
      { name: '팀 협업 기여', kpi: '주간 영업 회의 100% 참석, 동료 영업 지원 5건' },
      { name: '윤리적 영업 활동', kpi: '컴플라이언스 위반 0건, 사내 윤리 교육 이수' },
    ],
  },
  hr: {
    achievement: [
      { name: '인재 채용 목표 달성', kpi: '핵심 직무 10명 채용, 평균 합류율 70% 이상' },
      { name: '인사 시스템 도입', kpi: '신규 HR 시스템 구축, 사용자 만족도 4.0 이상' },
      { name: '성과 평가 제도 개선', kpi: '평가 만족도 15%p 상승, 클레임 30% 감소' },
      { name: '보상 체계 재설계', kpi: '시장 벤치마킹 완료, 임금 인상 정책 수립' },
      { name: '교육 프로그램 운영', kpi: '필수 교육 95% 이수, 만족도 4.2 이상' },
      { name: '복지 제도 개선', kpi: '신규 복지 3건 도입, 직원 만족도 10% 상승' },
    ],
    skill: [
      { name: 'HR 분석 역량', kpi: '인사 데이터 대시보드 구축, 월간 보고서 정례화' },
      { name: '노무 관리 전문성', kpi: '노무사 자격증 또는 관련 교육 이수' },
      { name: '커뮤니케이션 강화', kpi: '직원 1:1 면담 분기 30회 이상' },
      { name: '조직 문화 개선', kpi: '문화 진단 설문 실시, 액션 플랜 도출' },
    ],
    attitude: [
      { name: '공정성 유지', kpi: '평가·채용·승진 절차 투명성 유지, 클레임 0건' },
      { name: '비밀 유지', kpi: '인사 정보 보안 사고 0건, 정보 보호 교육 이수' },
      { name: '주도적 개선 활동', kpi: '인사 제도 개선 제안 5건 이상' },
    ],
  },
  executive: {
    achievement: [
      { name: '회사 매출 목표 달성', kpi: '연 매출 100억 달성, 전년 대비 30% 성장' },
      { name: '신규 사업 확장', kpi: '신규 시장 1개 진출, 매출 10억 이상' },
      { name: '투자 유치', kpi: 'Series B 유치, 100억 이상' },
      { name: '글로벌 진출', kpi: '해외 거점 1개 설립, 수출 매출 5억' },
      { name: '핵심 인재 확보', kpi: 'C레벨 채용 2명, 핵심 인재 리텐션 90%' },
      { name: '조직 운영 효율화', kpi: '운영 비용 10% 절감, 생산성 20% 향상' },
    ],
    skill: [
      { name: '전략 수립 역량', kpi: '연간 사업 계획 수립, 분기별 리뷰 정례화' },
      { name: '리더십 강화', kpi: '리더십 교육 이수, 임원 평가 4.0 이상' },
    ],
    attitude: [
      { name: '비전 공유', kpi: '월간 전사 미팅 운영, 직원 만족도 80% 이상' },
      { name: '대외 활동', kpi: '업계 컨퍼런스 분기 2회 이상 참여' },
    ],
  },
};

// === 평가 사이클 생성 (한 사용자, 한 분기) ===
function createEvalForUser(db, user, period, categories, grades, isCurrentPeriod) {
  const scenario = getScenarioForUser(user);
  const goals = GOAL_TEMPLATES[scenario] || GOAL_TEMPLATES.development;
  
  // 1. eval_cycle 생성
  const phase = isCurrentPeriod ? 'goal_approved' : 'final_done';
  const submittedAt = `${period.eval_year}-${quarterStartMonth(period.period_label)}-15 09:00:00`;
  const approvedAt = `${period.eval_year}-${quarterStartMonth(period.period_label)}-20 14:00:00`;
  
  const cycleResult = db.prepare(`
    INSERT INTO eval_cycles (user_id, period_type, period_label, eval_year, phase, 
                             self_reason, submitted_at, approved_at, locked, created_at, updated_at)
    VALUES (?, 'quarter', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    user.id, period.period_label, period.eval_year, phase,
    encrypt('분기 평가 목표 설정'),
    submittedAt, approvedAt,
    isCurrentPeriod ? 0 : 1
  );
  const evalId = cycleResult.lastInsertRowid;
  
  // 2. 카테고리별 2개씩 목표 생성 (6개 총)
  let goalCount = 0;
  const goalIdsCreated = [];
  
  for (const cat of categories) {
    // 카테고리 매핑: 업적목표 → achievement, 업무능력 → skill, 근무태도 → attitude
    let templatePool;
    if (cat.name.includes('업적')) templatePool = goals.achievement;
    else if (cat.name.includes('능력')) templatePool = goals.skill;
    else templatePool = goals.attitude;
    
    // 2개 무작위 선택
    const shuffled = [...templatePool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 2);
    
    // 비중: 70:30 또는 60:40 (무작위)
    const ratios = Math.random() > 0.5 ? [70, 30] : [60, 40];
    
    for (let i = 0; i < 2; i++) {
      const goal = selected[i];
      // 카테고리 내 비중 → 전체 가중치로 환산
      const weight = (cat.weight * ratios[i]) / 100;
      
      db.prepare(`
        INSERT INTO goals (eval_id, category_id, name, kpi, weight, sort_order, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'approved', datetime('now'))
      `).run(
        evalId, cat.id,
        encrypt(goal.name), encrypt(goal.kpi),
        weight, goalCount,
        // (last param is auto datetime)
      );
      
      const goalId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      goalIdsCreated.push({ id: goalId, name: goal.name, kpi: goal.kpi });
      goalCount++;
    }
  }
  
  // 3. 승인 이력 (1차 + 2차)
  let approvalCount = 0;
  if (user.manager_id) {
    db.prepare(`
      INSERT INTO goal_approvals (eval_id, approver_id, level, action, note, created_at)
      VALUES (?, ?, 1, 'approve', ?, ?)
    `).run(evalId, user.manager_id, encrypt('목표 승인'), submittedAt);
    approvalCount++;
    
    // 2차 승인자 (manager의 manager) 확인
    const mgr = db.prepare('SELECT manager_id FROM users WHERE id=?').get(user.manager_id);
    if (mgr && mgr.manager_id) {
      db.prepare(`
        INSERT INTO goal_approvals (eval_id, approver_id, level, action, note, created_at)
        VALUES (?, ?, 2, 'approve', ?, ?)
      `).run(evalId, mgr.manager_id, encrypt('최종 승인'), approvedAt);
      approvalCount++;
    }
  }
  
  // 4. 중간보고 (목표당 2~5회 불규칙)
  let reportCount = 0;
  for (const goal of goalIdsCreated) {
    const numReports = 2 + Math.floor(Math.random() * 4); // 2~5
    for (let r = 0; r < numReports; r++) {
      const reportText = generateReportText(scenario, goal.name, r + 1);
      db.prepare(`
        INSERT INTO progress_reports (eval_id, author_id, content, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).run(evalId, user.id, encrypt(reportText));
      reportCount++;
    }
  }
  
  // 5. 피드백 (목표당 2~5회 불규칙) — manager가 작성
  let feedbackCount = 0;
  if (user.manager_id) {
    const numFeedbacks = 2 + Math.floor(Math.random() * 4); // 2~5
    for (let f = 0; f < numFeedbacks; f++) {
      const fbText = generateFeedbackText(scenario, f + 1);
      
      const fbResult = db.prepare(`
        INSERT INTO feedbacks (eval_id, author_id, overall_note, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(evalId, user.manager_id, encrypt(fbText));
      const fbId = fbResult.lastInsertRowid;
      
      // 각 목표별 점수
      for (const goal of goalIdsCreated) {
        const score = generateFeedbackScore(scenario, period);
        db.prepare(`
          INSERT INTO feedback_items (feedback_id, goal_id, score, note, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(fbId, goal.id, score, encrypt(`목표 진행 중간 평가 ${f+1}`));
      }
      feedbackCount++;
    }
  }
  
  // 6. 최종평가 (과거 분기만, 최근 분기는 진행 중이므로 미작성)
  let finalCreated = false;
  if (!isCurrentPeriod) {
    finalCreated = createFinalEvaluation(db, user, evalId, goalIdsCreated, scenario, period, grades);
  }
  
  return {
    goals: goalCount,
    approvals: approvalCount,
    reports: reportCount,
    feedbacks: feedbackCount,
    finalCreated,
  };
}

// === 최종 평가 생성 ===
function createFinalEvaluation(db, user, evalId, goals, scenario, period, grades) {
  const selfDoneAt = `${period.eval_year}-${quarterEndMonth(period.period_label)}-25 18:00:00`;
  const mgrDoneAt = `${period.eval_year}-${quarterEndMonth(period.period_label)}-28 18:00:00`;
  const secondMgrDoneAt = `${period.eval_year}-${quarterEndMonth(period.period_label)}-30 18:00:00`;
  
  // 시나리오 + 분기 기반 점수 트렌드
  const trendBoost = getTrendBoost(scenario, period);
  
  // 자기평가·상사평가·2차평가 점수
  const selfNote = encrypt(generateSelfReviewText(scenario));
  const mgrNote = encrypt(generateMgrReviewText(scenario));
  
  // 등급 선정 (시나리오 기반)
  const baseScore = getBaseScore(scenario);
  const finalScore = Math.max(1, Math.min(5, baseScore + trendBoost + (Math.random() - 0.5) * 0.5));
  const finalGrade = scoreToGrade(finalScore, grades);
  
  // 2차 평가자 확인
  let secondMgrId = null;
  let secondMgrNote = null;
  if (user.manager_id) {
    const mgr = db.prepare('SELECT manager_id FROM users WHERE id=?').get(user.manager_id);
    secondMgrId = mgr?.manager_id || null;
    if (secondMgrId) {
      secondMgrNote = encrypt(generate2ndMgrReviewText(scenario));
    }
  }
  
  const finalResult = db.prepare(`
    INSERT INTO final_evaluations (
      eval_id, self_note, self_done, self_done_at,
      mgr_note, mgr_done, mgr_done_at, mgr_approver_id,
      final_score, final_grade, locked, locked_at,
      created_at, updated_at,
      second_mgr_done, second_mgr_note, second_mgr_id, second_mgr_done_at,
      selected_grade, second_selected_grade
    ) VALUES (?, ?, 1, ?, ?, 1, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?)
  `).run(
    evalId, selfNote, selfDoneAt,
    mgrNote, mgrDoneAt, user.manager_id,
    finalScore, finalGrade,
    secondMgrDoneAt,
    secondMgrId ? 1 : 0,
    secondMgrNote,
    secondMgrId,
    secondMgrId ? secondMgrDoneAt : null,
    finalGrade,
    secondMgrId ? finalGrade : null
  );
  const finalId = finalResult.lastInsertRowid;
  
  // 목표별 점수
  for (const goal of goals) {
    const selfScore = Math.round(Math.max(1, Math.min(5, baseScore + trendBoost + Math.random() - 0.3)) * 10) / 10;
    const mgrScore = Math.round(Math.max(1, Math.min(5, baseScore + trendBoost + Math.random() - 0.4)) * 10) / 10;
    const secondScore = secondMgrId ? Math.round(Math.max(1, Math.min(5, baseScore + trendBoost + Math.random() - 0.4)) * 10) / 10 : null;
    
    db.prepare(`
      INSERT INTO final_eval_scores (final_id, goal_id, self_score, mgr_score, second_mgr_score, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(finalId, goal.id, selfScore, mgrScore, secondScore);
  }
  
  return true;
}

// === 시나리오·분기별 트렌드 보정 ===
function getTrendBoost(scenario, period) {
  // period의 인덱스 (2024-1Q=0, 2026-1Q=8)
  const periodIdx = periodIndex(period);
  
  switch (scenario) {
    case 'development':
      // 변동 패턴: 상승 → 하락 → 회복
      const cycle = periodIdx % 4;
      if (cycle === 0) return 0.2;
      if (cycle === 1) return -0.3;
      if (cycle === 2) return -0.1;
      return 0.3;
    case 'sales':
      // 점진 상승
      return -0.3 + (periodIdx * 0.08);
    case 'hr':
      // 안정 (작은 변동)
      return (Math.random() - 0.5) * 0.2;
    case 'executive':
      // 회사 전체 평균과 비슷 (소폭 상승)
      return periodIdx * 0.04;
    default:
      return 0;
  }
}

function getBaseScore(scenario) {
  switch (scenario) {
    case 'development': return 3.7;
    case 'sales': return 3.5;
    case 'hr': return 3.8;
    case 'executive': return 4.0;
    default: return 3.5;
  }
}

function periodIndex(period) {
  const yearOffset = (parseInt(period.eval_year) - 2024) * 4;
  const qNum = parseInt(period.period_label.replace('Q', '')) - 1;
  return yearOffset + qNum;
}

function scoreToGrade(score, grades) {
  // grades는 sort_order로 정렬됨 (1번이 가장 높음)
  const gradeCount = grades.length;
  const sortOrder = Math.max(1, Math.min(gradeCount, Math.round(gradeCount - score + 1)));
  const grade = grades.find(g => g.sort_order === sortOrder);
  return grade?.grade_code || 'B';
}

function quarterStartMonth(label) {
  if (label === '1Q') return '01';
  if (label === '2Q') return '04';
  if (label === '3Q') return '07';
  if (label === '4Q') return '10';
  return '01';
}

function quarterEndMonth(label) {
  if (label === '1Q') return '03';
  if (label === '2Q') return '06';
  if (label === '3Q') return '09';
  if (label === '4Q') return '12';
  return '03';
}

// === 텍스트 생성 함수들 (시나리오별) ===

function generateReportText(scenario, goalName, reportNum) {
  const templates = {
    development: [
      `${goalName} - 진행률 ${20 + reportNum * 15}%. 핵심 모듈 개발 완료, 코드 리뷰 진행 중.`,
      `백엔드 API 설계 완료, 인프라 환경 셋업 중. 다음 주 통합 테스트 예정.`,
      `사용자 인터페이스 개선 작업 진행 중. 디자인 시안 컨펌 완료.`,
      `테스트 자동화 도입 완료, 커버리지 75% 달성. CI/CD 파이프라인 안정화.`,
      `성능 최적화 진행, P95 응답시간 30% 개선 확인.`,
    ],
    sales: [
      `${goalName} - 진행률 ${25 + reportNum * 15}%. 잠재 고객 5건 미팅 완료, 계약 협상 단계 3건.`,
      `엔터프라이즈 고객 대상 시연 완료, 긍정적 피드백 수신.`,
      `파트너사 협의 진행 중. 공동 영업 전략 수립 단계.`,
      `분기 매출 목표 80% 달성 예상. 잠재 신규 고객사 파이프라인 견고함.`,
      `RFP 응답 작성 완료, 2개사 우선협상 대상자 선정.`,
    ],
    hr: [
      `${goalName} - 진행률 ${30 + reportNum * 12}%. 채용 공고 게재, 지원자 50명 검토.`,
      `1차 면접 진행, 우수 인재 5명 2차 면접 예정.`,
      `평가 시스템 베타 테스트 진행. 사용자 피드백 수집 완료.`,
      `복지 제도 개선안 임원진 보고 완료, 시행 일정 확정.`,
      `사내 교육 프로그램 운영, 참여율 85% 달성.`,
    ],
    executive: [
      `${goalName} - 진행률 ${35 + reportNum * 10}%. 전략 회의 정례화, 분기 KPI 점검 완료.`,
      `신규 시장 진출 검토, 시장 조사 보고서 완성.`,
      `이사회 보고 완료, 차기 분기 사업 방향 승인.`,
      `핵심 임원진과의 1:1 면담 정례화, 조직 운영 효율화 추진.`,
    ],
  };
  
  const pool = templates[scenario] || templates.development;
  return pool[reportNum % pool.length];
}

function generateFeedbackText(scenario, fbNum) {
  const templates = {
    development: [
      '코드 품질 우수, 코드 리뷰에서 적극적 기여. 일정 준수도 양호.',
      '기술적 도전 과제를 적극 수용하며 학습 속도가 빠름. 팀 협업 우수.',
      '문제 해결 능력 뛰어남. 다만 문서화 보완 필요.',
      '주도적으로 개선 사항 발굴. 사용자 관점에서 사고하는 자세 인상적.',
    ],
    sales: [
      '신규 고객 발굴 의지 우수, 클로징 능력 향상 필요.',
      '시장 트렌드 파악 능력 탁월. 영업 전략 수립 기여도 높음.',
      '고객 관계 관리 우수, 장기 고객 확보에 강점.',
      '협상력 향상 중. 단가 협상 시 자신감 더 보강 필요.',
    ],
    hr: [
      '인사 업무 전반에 대한 이해도 높음. 디테일 챙기는 능력 우수.',
      '직원 응대 시 공정성 유지 잘 함. 비밀 유지 의식 철저.',
      '개선 제안 자주 함. 실행력도 안정적.',
      '데이터 분석 역량 향상 중. 정량적 의사결정 능력 강화 필요.',
    ],
    executive: [
      '전사 비전 수립과 실행 균형 우수. 임원진 협업 안정적.',
      '시장 통찰력 인상적. 신사업 발굴 능력 탁월.',
      '리더십 강화 중. 의사결정 속도와 정확성 모두 향상.',
    ],
  };
  
  const pool = templates[scenario] || templates.development;
  return pool[fbNum % pool.length];
}

function generateFeedbackScore(scenario, period) {
  const base = getBaseScore(scenario);
  const trend = getTrendBoost(scenario, period);
  const score = base + trend + (Math.random() - 0.5) * 0.6;
  return Math.round(Math.max(1, Math.min(5, score)) * 10) / 10;
}

function generateSelfReviewText(scenario) {
  const templates = {
    development: '이번 분기 목표 대비 진행률 80% 달성. 기술적 도전 과제를 통해 역량을 키웠으며, 팀 협업에서 적극적인 역할을 했습니다. 다음 분기는 문서화와 코드 품질 개선에 집중하겠습니다.',
    sales: '분기 매출 목표 90% 달성, 신규 고객사 4건 확보. 엔터프라이즈 고객 응대 역량을 강화했습니다. 다음 분기는 협상력 강화와 업셀링 전략을 보완하겠습니다.',
    hr: '인사 시스템 도입과 평가 제도 개선 모두 안정적으로 진행. 직원 만족도 조사 결과 긍정적. 다음 분기는 데이터 기반 의사결정을 더 강화하겠습니다.',
    executive: '전사 매출 목표 달성, 신규 시장 진출 기반 마련. 임원진 협업과 의사결정 효율성을 강화했습니다.',
  };
  return templates[scenario] || templates.development;
}

function generateMgrReviewText(scenario) {
  const templates = {
    development: '핵심 프로젝트 기여도 우수, 코드 품질 안정적. 팀 내 멘토링 역할도 잘 수행했습니다. 향후 시스템 설계 역량 강화를 권장합니다.',
    sales: '영업 활동 매우 적극적. 분기 목표 달성에 핵심 기여. 다음 분기는 대형 고객사 클로징에 집중하면 좋겠습니다.',
    hr: '안정적 업무 수행, 공정성 유지. 인사 데이터 활용 능력을 더 키우면 좋겠습니다.',
    executive: '전략 수립과 실행 모두 안정적. 임원진 리더십 발휘 우수.',
  };
  return templates[scenario] || templates.development;
}

function generate2ndMgrReviewText(scenario) {
  const templates = {
    development: '전반적으로 1차 평가자 의견에 동의. 기술 리더십 가능성 보임.',
    sales: '실적 우수, 향후 영업 리더 역할 가능성 평가.',
    hr: '안정적 업무 수행, 향후 인사 정책 기획 역량 강화 권장.',
    executive: '전사 성과 기여 인정.',
  };
  return templates[scenario] || templates.development;
}

main();
```

### 3. 실행 및 검증

```bash
# 실행 (서버 종료 상태에서)
node scripts/seed-eval-data.js
```

기대 출력:
```
🌱 시드 데이터 생성 시작

✅ 백업: data/hrmanage.db.bak.before-seed-2026-05-27T...
🗑️  기존 평가 데이터 삭제...
   ✅ 완료
   📅 신규 평가 기간 생성: 2024-1Q
   ...
📋 사용자 8명, 카테고리 3개, 등급 5개
📅 평가 기간 9개

📊 생성 통계:
  - 평가 사이클: 72  (8명 × 9분기)
  - 목표: 432  (72 × 6)
  - 승인 이력: ~120
  - 중간보고: ~1500
  - 피드백: ~250
  - 최종평가: 64  (현재 분기 1개 제외)

✅ 시드 데이터 생성 완료
```

### 4. 데이터 검증

```bash
# 전체 평가 사이클 수 확인
sqlite3 data/hrmanage.db "SELECT COUNT(*) FROM eval_cycles;"
# → 72 기대

# 분기별 분포
sqlite3 data/hrmanage.db "SELECT eval_year, period_label, COUNT(*) FROM eval_cycles GROUP BY eval_year, period_label;"
# → 각 분기 8건씩

# 최종평가 개수
sqlite3 data/hrmanage.db "SELECT COUNT(*) FROM final_evaluations;"
# → 64 기대 (가장 최근 분기 8건 제외)

# 점수 분포 확인
sqlite3 data/hrmanage.db "SELECT final_grade, COUNT(*) FROM final_evaluations GROUP BY final_grade;"
```

### 5. 기능 검증

웹 화면에서 다음 확인:
1. **ceo 로그인** → 성과관리 → 전체 조직 분석 (PROMPT 58 결과물) → 9분기 데이터 확인
2. **분기별 추이 차트** → 시나리오 트렌드 반영 확인 (개발팀 변동, 영업팀 상승, 인사팀 안정)
3. **AI 요약 생성** → 의미 있는 결과 도출
4. **dev1 로그인** → 본인 + 하위 조직 데이터 표시 확인

### 6. 문서 업데이트

`ClaudeHRM.md` 최근 개발 이력 1줄 추가:
```
| 2026-05-27 | 시드 데이터 생성 스크립트 (9분기 × 8명, AI 분석 검증용, scripts/seed-eval-data.js) (PROMPT 59) | Claude Code |
```

`ClaudeHRM.md` 파일 구조 섹션에 `scripts/seed-eval-data.js` 추가.

### 7. Git 커밋 (푸시는 검증 통과 후 수동)

```bash
git add scripts/seed-eval-data.js ClaudeHRM.md
git commit -m "시드 데이터 생성 스크립트 (9분기 × 8명, AI 분석 검증용) (PROMPT 59)"
# 푸시 보류 — 사용자 검증 후
```

## 작업 완료 체크리스트

- [ ] 사전 카테고리·등급·사용자·조직 데이터 확인
- [ ] `scripts/seed-eval-data.js` 신규 작성
- [ ] 백업 자동화 동작 확인
- [ ] 9분기 평가 기간 생성 (2024·2025년 신규)
- [ ] 8명 × 9분기 = 72개 사이클
- [ ] 사이클당 6개 목표 (카테고리 3개 × 2개)
- [ ] 카테고리 내 비중 70:30 또는 60:40 무작위
- [ ] 시나리오별 목표/보고/피드백/평가 텍스트 생성
- [ ] 중간보고 목표당 2~5회
- [ ] 피드백 목표당 2~5회
- [ ] 가장 최근 분기(2026-1Q)는 final_done 미작성
- [ ] 점수·등급이 시나리오 트렌드 반영 (개발 변동, 영업 상승, 인사 안정)
- [ ] 실행 결과 통계 출력 확인
- [ ] 웹 화면에서 데이터 표시 검증
- [ ] ClaudeHRM.md 갱신
- [ ] git commit 완료
- [ ] **푸시 보류, 사용자 검증 후 수동 푸시**

## 주의사항

- **백업 필수**: 스크립트가 자동으로 백업하지만, 사용자도 한 번 더 백업 권장
- **재실행 안전**: 기존 시드 데이터 자동 정리 후 재생성, 사용자·조직·카테고리·등급은 유지
- **트랜잭션 사용**: 실패 시 자동 롤백
- **암호화 필드**: server/index.js의 encrypt와 동일 (ENC_SECRET 환경변수 사용)
- **자동 푸시 금지**: DB 데이터 전체 교체 — 회색 지대, 사용자 검증 후 수동 푸시
- **PROMPT 58 검증과 통합**: PROMPT 58 완료 후 PROMPT 59 실행해야 AI 분석 결과 즉시 확인 가능

## 다음 단계 (이번 작업 이후)

PROMPT 59 완료 후 PROMPT 58의 AI 요약 기능을 다시 호출 → 9분기 데이터 기반 의미 있는 결과 확인.
