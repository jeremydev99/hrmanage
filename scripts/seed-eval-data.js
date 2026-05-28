/**
 * 시드 데이터 생성 스크립트
 *
 * 용도: AI 분석 검증을 위한 9분기 평가 데이터 자동 생성
 * 실행: node scripts/seed-eval-data.js  (프로젝트 루트에서)
 *       또는 docker exec hrmanage_app node /app/scripts/seed-eval-data.js
 *
 * 동작:
 * 1. 백업: data/hrmanage.db → data/hrmanage.db.bak.before-seed-{timestamp}
 * 2. 기존 평가 데이터 삭제 (users/organizations/grade_criteria/goal_categories 유지)
 * 3. 2024년 분기 평가 기간 4개 신규 생성 (2025·2026 기존 유지)
 * 4. 8명 × 9분기 = 72개 평가 사이클 생성
 * 5. 사이클당 6개 목표 (카테고리 3개 × 2개)
 * 6. 중간보고·피드백·최종평가·점수 채우기
 * 7. 통계 출력
 */
require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH   = path.join(__dirname, '..', 'data', 'hrmanage.db');
const ENC_SECRET = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';

// ── 암호화 (server/index.js 동일 방식) ─────────────────────
function encrypt(text) {
  if (!text) return '';
  const iv  = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENC_SECRET, 'salt', 32);
  const c   = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

// ── 시드용 final_score 계산 (server/index.js calcFinalScore와 동일 공식) ──
function calcSeedFinalScore(goalScores, cats) {
  const catWeightMap = new Map(cats.map(c => [c.id, Number(c.weight) || 0]));
  const byCat = new Map();
  for (const g of goalScores) {
    if (!byCat.has(g.category_id)) byCat.set(g.category_id, []);
    byCat.get(g.category_id).push(g);
  }
  let finalScore = 0, usedCatW = 0;
  for (const [catId, gs] of byCat) {
    const catW = catWeightMap.get(catId);
    if (!catW) continue;
    const totalInner = gs.reduce((a, g) => a + g.weight, 0) || 1;
    const catScore = gs.reduce(
      (a, g) => a + (g.mgr_score / 5 * 100) * (g.weight / totalInner), 0
    );
    finalScore += catScore * (catW / 100);
    usedCatW += catW;
  }
  if (usedCatW > 0 && usedCatW < 100) finalScore = finalScore * (100 / usedCatW);
  return Math.round(finalScore * 100) / 100;
}

// ── 백업 ────────────────────────────────────────────────────
function backupDb() {
  const backupDir = path.join(__dirname, '..', 'data', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const bakPath = path.join(backupDir, `hrmanage.${ts}.db`);
  fs.copyFileSync(DB_PATH, bakPath);
  // 1주 이상 된 백업 정리
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(backupDir)) {
    const fp = path.join(backupDir, f);
    if (fs.statSync(fp).mtimeMs < oneWeekAgo) {
      fs.unlinkSync(fp);
      console.log(`  ↳ 오래된 백업 제거: ${f}`);
    }
  }
  console.log(`✅ 백업 완료: ${bakPath}`);
  return bakPath;
}

// ── 메인 ────────────────────────────────────────────────────
function main() {
  console.log('🌱 시드 데이터 생성 시작\n');

  const bakPath = backupDb();
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  let stats = {};
  try {
    db.transaction(() => {
      cleanupOldData(db);
      const periods    = ensurePeriods(db);
      const users      = loadUsers(db);
      const categories = loadCategories(db);
      const grades     = loadGrades(db);

      console.log(`\n📋 사용자 ${users.length}명 · 카테고리 ${categories.length}개 · 등급 ${grades.filter(g=>g.grade_code!=='NC').length}개 (NC 제외)`);
      console.log(`📅 평가 기간 ${periods.length}개\n`);

      let totalCycles = 0, totalGoals = 0, totalApprovals = 0;
      let totalReports = 0, totalFeedbacks = 0, totalFinals = 0;

      for (const user of users) {
        for (const period of periods) {
          const isCurrent = isLatestPeriod(period, periods);
          const r = createEvalForUser(db, user, period, categories, grades, isCurrent);
          totalCycles++;
          totalGoals     += r.goals;
          totalApprovals += r.approvals;
          totalReports   += r.reports;
          totalFeedbacks += r.feedbacks;
          if (r.finalCreated) totalFinals++;
        }
      }

      stats = { totalCycles, totalGoals, totalApprovals, totalReports, totalFeedbacks, totalFinals };
    })();

    console.log('\n📊 생성 통계:');
    console.log(`  - 평가 사이클:  ${stats.totalCycles}   (${stats.totalCycles / 9}명 × 9분기)`);
    console.log(`  - 목표:         ${stats.totalGoals}  (사이클당 6개)`);
    console.log(`  - 승인 이력:    ${stats.totalApprovals}`);
    console.log(`  - 중간보고:     ${stats.totalReports}`);
    console.log(`  - 피드백:       ${stats.totalFeedbacks}`);
    console.log(`  - 최종평가:     ${stats.totalFinals}   (최근 분기 제외)`);
    console.log('\n✅ 시드 데이터 생성 완료');
    console.log(`💾 백업: ${bakPath}`);
    console.log('⚠️  복원: copy /Y "' + bakPath + '" "' + DB_PATH + '"');
  } catch (err) {
    console.error('\n❌ 시드 생성 실패:', err.message);
    console.error(err.stack);
    console.log(`🔄 복원: copy /Y "${bakPath}" "${DB_PATH}"`);
    process.exit(1);
  } finally {
    db.close();
  }
}

// ── 기존 평가 데이터 정리 ────────────────────────────────────
function cleanupOldData(db) {
  console.log('🗑️  기존 평가 데이터 삭제...');
  db.prepare('DELETE FROM final_eval_scores').run();
  db.prepare('DELETE FROM final_evaluations').run();
  db.prepare('DELETE FROM report_files').run();
  db.prepare('DELETE FROM progress_reports').run();
  db.prepare('DELETE FROM feedback_items').run();
  db.prepare('DELETE FROM feedbacks').run();
  db.prepare('DELETE FROM goal_approvals').run();
  db.prepare('DELETE FROM goals').run();
  db.prepare('DELETE FROM eval_cycles').run();
  // audit_logs 유지 (기존 이력 보존)
  console.log('   ✅ 완료');
}

// ── 9개 평가 기간 보장 ───────────────────────────────────────
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

function ensurePeriods(db) {
  const results = [];
  for (const t of TARGET_PERIODS) {
    let p = db.prepare(
      'SELECT * FROM eval_periods WHERE eval_year=? AND period_label=?'
    ).get(t.evalYear, t.label);

    if (!p) {
      const res = db.prepare(`
        INSERT INTO eval_periods (period_type, period_label, eval_year, is_active, created_by, eval_mode, locked)
        VALUES ('quarter', ?, ?, 1, NULL, 'MBO', 0)
      `).run(t.label, t.evalYear);
      p = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(res.lastInsertRowid);
      console.log(`   📅 신규 생성: ${t.label}`);
    }
    results.push(p);
  }
  // 배열 순서가 시간 순서 (TARGET_PERIODS 정의 순)를 반영하도록 정렬
  results.sort((a, b) => periodIndex(a) - periodIndex(b));
  return results;
}

function isLatestPeriod(p, all) {
  return periodIndex(p) === Math.max(...all.map(periodIndex));
}

// ── 사용자·카테고리·등급 로드 ────────────────────────────────
function loadUsers(db) {
  return db.prepare(
    'SELECT id, name, email, role, dept, manager_id, org_id FROM users WHERE is_active=1 ORDER BY id'
  ).all();
}
function loadCategories(db) {
  return db.prepare(
    'SELECT id, name, weight, sort_order FROM goal_categories WHERE is_active=1 ORDER BY sort_order'
  ).all();
}
function loadGrades(db) {
  return db.prepare(
    "SELECT id, grade_code, sort_order FROM grade_criteria WHERE is_active=1 ORDER BY sort_order"
  ).all();
}

// ── 시나리오 매핑 ────────────────────────────────────────────
function getScenario(user) {
  if (user.email === 'ceo@synapsoft.com') return 'executive';
  const d = (user.dept || '').toLowerCase();
  if (d.includes('개발') || user.email.includes('dev'))   return 'development';
  if (d.includes('영업') || user.email.includes('sales')) return 'sales';
  if (d.includes('인사') || user.email.includes('hr'))    return 'hr';
  return 'general';
}

// ── 목표 템플릿 풀 ───────────────────────────────────────────
const GOALS = {
  development: {
    achievement: [
      { name: 'SaaS 플랫폼 v3.0 출시',     kpi: '신규 기능 5개, 안정성 99.5%, 베타 고객사 10개 확보' },
      { name: 'AI 모듈 통합 개발',           kpi: '추천 엔진 정확도 85% 이상, 응답시간 200ms 이하' },
      { name: '레거시 시스템 마이그레이션',   kpi: '기능 100% 이전, 다운타임 4시간 이하' },
      { name: '결제 게이트웨이 리팩토링',     kpi: '에러율 0.1% 이하, 처리속도 30% 개선' },
      { name: '모바일 앱 신규 출시',          kpi: 'iOS/Android 동시 출시, 평점 4.0 이상' },
      { name: 'API 응답 속도 개선',           kpi: '평균 응답시간 50% 단축, P95 200ms 이하' },
    ],
    skill: [
      { name: '기술 스택 확장 학습',   kpi: '신규 프레임워크 1개 도입, 사내 세미나 2회 발표' },
      { name: '코드 리뷰 품질 향상',   kpi: '주간 5건 이상 리뷰, 응답 24시간 이내' },
      { name: '클라우드 자격증 취득',   kpi: 'AWS/NCP 관련 자격증 1개 취득' },
      { name: '오픈소스 기여',          kpi: '기여 PR 3건 머지, 사내 라이브러리 1개 공개' },
    ],
    attitude: [
      { name: '협업 및 커뮤니케이션',   kpi: '스프린트 회의 100% 참석, 팀 만족도 4.0 이상' },
      { name: '주도적 문제 해결',        kpi: '제안 안건 분기 2건 이상, 채택 1건 이상' },
      { name: '신입사원 멘토링',         kpi: '신입 1인 전담, 분기말 만족도 4.5 이상' },
    ],
  },
  sales: {
    achievement: [
      { name: '신규 고객사 확보',    kpi: '분기 신규 계약 5건, 매출 5억 달성' },
      { name: '기존 고객 업셀링',    kpi: '기존 고객 30% 추가 매출, 리텐션 90%' },
      { name: '엔터프라이즈 고객 유치', kpi: '500인 이상 기업 2곳 신규 계약' },
      { name: '연간 매출 목표 달성', kpi: '분기 7.5억 목표 달성' },
      { name: '제휴 파트너십 확장',  kpi: '신규 파트너 3개사, 공동 영업 10건' },
      { name: '마케팅 캠페인 운영',  kpi: '인바운드 리드 200건, 전환율 15%' },
    ],
    skill: [
      { name: '제품 도메인 지식',    kpi: '제품 교육 100% 이수, 인증 90점 이상' },
      { name: '협상 스킬 향상',      kpi: '협상 워크숍 참여, 계약 단가 10% 상승' },
      { name: 'CRM 도구 활용',       kpi: 'Salesforce 활용도 95%' },
      { name: '고객 인사이트 분석',  kpi: '월간 시장 보고서, 경영진 보고 정례화' },
    ],
    attitude: [
      { name: '고객 응대 만족도',    kpi: 'NPS 60 이상, 응답 4시간 이내' },
      { name: '팀 협업 기여',         kpi: '주간 회의 100% 참석, 동료 지원 5건' },
      { name: '윤리적 영업 활동',    kpi: '컴플라이언스 위반 0건' },
    ],
  },
  hr: {
    achievement: [
      { name: '인재 채용 목표 달성',     kpi: '핵심 직무 10명 채용, 합류율 70%' },
      { name: '인사 시스템 도입',         kpi: '신규 HR 시스템 구축, 만족도 4.0' },
      { name: '성과 평가 제도 개선',      kpi: '만족도 15%p 상승, 클레임 30% 감소' },
      { name: '보상 체계 재설계',         kpi: '시장 벤치마킹 완료, 인상 정책 수립' },
      { name: '교육 프로그램 운영',       kpi: '필수 교육 95% 이수, 만족도 4.2' },
      { name: '복지 제도 개선',           kpi: '신규 복지 3건, 직원 만족도 10% 상승' },
    ],
    skill: [
      { name: 'HR 분석 역량',    kpi: '인사 데이터 대시보드 구축, 월간 보고서' },
      { name: '노무 관리 전문성', kpi: '노무사 관련 교육 이수' },
      { name: '커뮤니케이션 강화', kpi: '직원 1:1 면담 분기 30회' },
      { name: '조직 문화 개선',   kpi: '문화 진단 설문, 액션 플랜 도출' },
    ],
    attitude: [
      { name: '공정성 유지',      kpi: '평가·채용 절차 투명성, 클레임 0건' },
      { name: '비밀 유지',         kpi: '정보 보안 사고 0건, 보호 교육 이수' },
      { name: '주도적 개선 활동', kpi: '인사 제도 개선 제안 5건 이상' },
    ],
  },
  executive: {
    achievement: [
      { name: '회사 매출 목표 달성', kpi: '연 매출 100억, 전년 대비 30% 성장' },
      { name: '신규 사업 확장',       kpi: '신규 시장 1개 진출, 매출 10억' },
      { name: '투자 유치',             kpi: 'Series B 유치, 100억 이상' },
      { name: '글로벌 진출',           kpi: '해외 거점 1개, 수출 5억' },
      { name: '핵심 인재 확보',        kpi: 'C레벨 채용 2명, 리텐션 90%' },
      { name: '조직 운영 효율화',      kpi: '운영 비용 10% 절감, 생산성 20% 향상' },
    ],
    skill: [
      { name: '전략 수립 역량',  kpi: '연간 사업 계획 수립, 분기별 리뷰' },
      { name: '리더십 강화',      kpi: '리더십 교육 이수, 임원 평가 4.0' },
    ],
    attitude: [
      { name: '비전 공유',    kpi: '월간 전사 미팅, 직원 만족도 80%' },
      { name: '대외 활동',    kpi: '업계 컨퍼런스 분기 2회 이상' },
    ],
  },
};
GOALS.general = GOALS.hr;

// ── 평가 사이클 1개 생성 ─────────────────────────────────────
function createEvalForUser(db, user, period, categories, grades, isCurrent) {
  const scenario = getScenario(user);
  const tmpl     = GOALS[scenario] || GOALS.hr;
  const phase    = isCurrent ? 'approved' : 'final_done';
  const yr       = parseInt(period.eval_year);           // "2024년" → 2024
  const startMon = quarterStartMonth(period.period_label);
  const endMon   = quarterEndMonth(period.period_label);

  const submittedAt = `${yr}-${startMon}-15 09:00:00`;
  const approvedAt  = `${yr}-${startMon}-20 14:00:00`;

  const cycleRes = db.prepare(`
    INSERT INTO eval_cycles
      (user_id, period_type, period_label, eval_year, phase,
       self_reason, submitted_at, approved_at, locked, created_at, updated_at)
    VALUES (?, 'quarter', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    user.id, period.period_label, period.eval_year, phase,
    encrypt('분기 평가 목표 설정'),
    submittedAt, approvedAt,
    isCurrent ? 0 : 1
  );
  const evalId = cycleRes.lastInsertRowid;

  // 카테고리별 2개 목표
  const goalRecs = [];
  let goalOrder = 0;
  for (const cat of categories) {
    const pool = cat.name.includes('업적') ? tmpl.achievement
               : cat.name.includes('능력') ? tmpl.skill
               : tmpl.attitude;
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 2);
    const ratios   = Math.random() > 0.5 ? [70, 30] : [60, 40];

    for (let i = 0; i < 2; i++) {
      const g      = shuffled[i] || pool[i % pool.length];
      const weight = ratios[i];  // 카테고리 내 비중 (합=100)
      const res = db.prepare(`
        INSERT INTO goals (eval_id, category_id, name, kpi, weight, sort_order, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'approved', datetime('now'))
      `).run(evalId, cat.id, encrypt(g.name), encrypt(g.kpi), weight, goalOrder++);
      goalRecs.push({ id: res.lastInsertRowid, name: g.name, category_id: cat.id, weight });
    }
  }

  // 승인 이력
  let approvals = 0;
  if (user.manager_id) {
    db.prepare(`
      INSERT INTO goal_approvals (eval_id, approver_id, level, action, note, created_at)
      VALUES (?, ?, 1, 'approve', ?, ?)
    `).run(evalId, user.manager_id, encrypt('목표 승인'), submittedAt);
    approvals++;
    const mgr2 = db.prepare('SELECT manager_id FROM users WHERE id=?').get(user.manager_id);
    if (mgr2?.manager_id) {
      db.prepare(`
        INSERT INTO goal_approvals (eval_id, approver_id, level, action, note, created_at)
        VALUES (?, ?, 2, 'approve', ?, ?)
      `).run(evalId, mgr2.manager_id, encrypt('최종 승인'), approvedAt);
      approvals++;
    }
  }

  // 중간보고
  let reports = 0;
  for (const goal of goalRecs) {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let r = 0; r < n; r++) {
      db.prepare(`
        INSERT INTO progress_reports (eval_id, author_id, content, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).run(evalId, user.id, encrypt(reportText(scenario, goal.name, r + 1)));
      reports++;
    }
  }

  // 피드백 (manager 작성)
  let feedbacks = 0;
  if (user.manager_id) {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let f = 0; f < n; f++) {
      const fbRes = db.prepare(`
        INSERT INTO feedbacks (eval_id, author_id, overall_note, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(evalId, user.manager_id, encrypt(feedbackText(scenario, f + 1)));
      const fbId = fbRes.lastInsertRowid;
      for (const goal of goalRecs) {
        const sc = Math.round(Math.max(1, Math.min(5, 3 + getTrendBoost(scenario, period) + (Math.random() - 0.5))));
        db.prepare(`
          INSERT INTO feedback_items (feedback_id, goal_id, score, note, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(fbId, goal.id, sc, encrypt(`목표 중간 평가 ${f + 1}회차`));
      }
      feedbacks++;
    }
  }

  // 최종 평가 (현재 분기 제외)
  let finalCreated = false;
  if (!isCurrent) {
    finalCreated = createFinal(db, user, evalId, goalRecs, scenario, period, grades, yr, endMon);
  }

  return { goals: goalRecs.length, approvals, reports, feedbacks, finalCreated };
}

// ── 최종 평가 생성 ───────────────────────────────────────────
function createFinal(db, user, evalId, goalRecs, scenario, period, grades, yr, endMon) {
  const selfDoneAt   = `${yr}-${endMon}-25 18:00:00`;
  const mgrDoneAt    = `${yr}-${endMon}-27 18:00:00`;
  const secondDoneAt = `${yr}-${endMon}-29 18:00:00`;

  let secondMgrId = null;
  if (user.manager_id) {
    const mgr = db.prepare('SELECT manager_id FROM users WHERE id=?').get(user.manager_id);
    secondMgrId = mgr?.manager_id || null;
  }

  const base  = getBaseScore(scenario);
  const boost = getTrendBoost(scenario, period);

  // 목표별 점수 계산 (1-5 스케일)
  const goalScores   = [];
  const perGoalScores = [];
  for (const goal of goalRecs) {
    const selfSc = Math.round(Math.max(1, Math.min(5, base + boost + (Math.random() - 0.4))));
    const mgrSc  = Math.round(Math.max(1, Math.min(5, base + boost + (Math.random() - 0.4))));
    const sec2Sc = secondMgrId ? Math.round(Math.max(1, Math.min(5, base + boost + (Math.random() - 0.4)))) : null;
    goalScores.push({ category_id: goal.category_id, weight: goal.weight, mgr_score: mgrSc });
    perGoalScores.push({ goal, selfSc, mgrSc, sec2Sc });
  }

  // final_score 0-100 스케일 계산
  const activeCats   = db.prepare('SELECT id, weight FROM goal_categories WHERE is_active=1').all();
  const activeGrades = grades.filter(g => g.grade_code !== 'NC');
  const finalScore   = calcSeedFinalScore(goalScores, activeCats);
  const finalGrade   = scoreToGrade(finalScore, activeGrades);

  const feRes = db.prepare(`
    INSERT INTO final_evaluations
      (eval_id, self_note, self_done, self_done_at,
       mgr_note, mgr_done, mgr_done_at, mgr_approver_id,
       final_score, final_grade, selected_grade, second_selected_grade,
       locked, locked_at,
       second_mgr_done, second_mgr_note, second_mgr_id, second_mgr_done_at,
       created_at, updated_at)
    VALUES (?, ?, 1, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    evalId,
    encrypt(selfReviewText(scenario)), selfDoneAt,
    encrypt(mgrReviewText(scenario)),  mgrDoneAt, user.manager_id,
    finalScore, finalGrade, finalGrade,
    secondMgrId ? finalGrade : null,
    secondDoneAt,
    secondMgrId ? 1 : 0,
    secondMgrId ? encrypt(secondMgrReviewText(scenario)) : null,
    secondMgrId,
    secondMgrId ? secondDoneAt : null
  );
  const feId = feRes.lastInsertRowid;

  for (const { goal, selfSc, mgrSc, sec2Sc } of perGoalScores) {
    db.prepare(`
      INSERT INTO final_eval_scores
        (final_id, goal_id, self_score, mgr_score, second_mgr_score, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(feId, goal.id, selfSc, mgrSc, sec2Sc);
  }
  return true;
}

// ── 점수 → 등급 (0-100점 → OI/EE/SC/ME/PB/IR) ───────────────
function scoreToGrade(score, activeGrades) {
  const n = activeGrades.length || 6;
  // 0-100 → 1-n 선형 변환 후 sort_order 결정 (높은 점수 = 낮은 sort_order = 좋은 등급)
  const s1n = score * (n - 1) / 100 + 1;
  const sortOrder = Math.max(1, Math.min(n, Math.round(n + 1 - s1n)));
  return activeGrades.find(g => g.sort_order === sortOrder)?.grade_code || 'ME';
}

// ── 기본 점수 (1-5 스케일, 목표 mgr_score 기준) ──────────────
function getBaseScore(scenario) {
  switch (scenario) {
    case 'development': return 4.3;   // 고성과
    case 'sales':       return 3.3;   // 중간 (상승 추세)
    case 'hr':          return 4.6;   // 고성과
    case 'executive':   return 5.1;   // 최고 (clamp → 5)
    default:            return 3.8;
  }
}

// ── 분기별 트렌드 보정 (1-5 스케일 기준 소폭 조정) ───────────
function getTrendBoost(scenario, period) {
  const idx = periodIndex(period); // 0(2024-1Q) ~ 8(2026-1Q)
  switch (scenario) {
    case 'development': {
      // 변동 패턴: +0.5 / -0.6 / -0.2 / +0.6 사이클
      const c = idx % 4;
      return [0.5, -0.6, -0.2, 0.6][c];
    }
    case 'sales':
      // 점진 상승: 분기당 +0.2 (총 +1.6)
      return -0.3 + idx * 0.22;
    case 'hr':
      // 안정: 소폭 변동
      return (Math.random() - 0.5) * 0.4;
    case 'executive':
      // 소폭 상승
      return idx * 0.06;
    default:
      return 0;
  }
}

// ── 기간 인덱스 (2024-1Q=0 ~ 2026-1Q=8) ─────────────────────
function periodIndex(period) {
  const yr = parseInt(period.eval_year);                    // "2024년" → 2024
  const m  = period.period_label.match(/(\d+)분기/);
  const q  = m ? parseInt(m[1]) : 1;
  return (yr - 2024) * 4 + (q - 1);
}

function quarterStartMonth(label) {
  const m = label.match(/(\d+)분기/);
  const q = m ? parseInt(m[1]) : 1;
  return ['01','04','07','10'][q - 1] || '01';
}
function quarterEndMonth(label) {
  const m = label.match(/(\d+)분기/);
  const q = m ? parseInt(m[1]) : 1;
  return ['03','06','09','12'][q - 1] || '03';
}

// ── 텍스트 생성 ─────────────────────────────────────────────
function reportText(scenario, goalName, n) {
  const t = {
    development: [
      `${goalName} 진행률 ${20 + n * 15}%. 핵심 모듈 개발 완료, 코드 리뷰 진행 중.`,
      `백엔드 API 설계 완료, 인프라 셋업 중. 다음 주 통합 테스트 예정.`,
      `UI 개선 작업 진행 중. 디자인 시안 컨펌 완료.`,
      `테스트 자동화 도입, 커버리지 75%. CI/CD 파이프라인 안정화.`,
      `성능 최적화 진행, P95 응답시간 30% 개선 확인.`,
    ],
    sales: [
      `${goalName} 진행률 ${25 + n * 15}%. 잠재 고객 5건 미팅 완료, 협상 단계 3건.`,
      `엔터프라이즈 고객 대상 시연, 긍정적 피드백.`,
      `파트너사 협의 진행. 공동 영업 전략 수립.`,
      `분기 목표 80% 달성 예상. 파이프라인 견고.`,
      `RFP 응답 완료, 2개사 우선협상 선정.`,
    ],
    hr: [
      `${goalName} 진행률 ${30 + n * 12}%. 채용 공고 게재, 지원자 50명 검토.`,
      `1차 면접 진행, 우수 인재 5명 2차 예정.`,
      `평가 시스템 베타 테스트. 사용자 피드백 수집.`,
      `복지 제도 개선안 임원진 보고, 시행 일정 확정.`,
      `사내 교육 프로그램 운영, 참여율 85%.`,
    ],
    executive: [
      `${goalName} 진행률 ${35 + n * 10}%. 전략 회의 정례화, 분기 KPI 점검 완료.`,
      `신규 시장 진출 검토, 시장 조사 보고서 완성.`,
      `이사회 보고 완료, 차기 사업 방향 승인.`,
      `핵심 임원 1:1 면담 정례화, 조직 효율화 추진.`,
    ],
  };
  const pool = t[scenario] || t.hr;
  return pool[n % pool.length];
}

function feedbackText(scenario, n) {
  const t = {
    development: [
      '코드 품질 우수, 리뷰에서 적극 기여. 일정 준수 양호.',
      '기술 도전 과제 적극 수용, 팀 협업 우수.',
      '문제 해결 능력 뛰어남. 문서화 보완 필요.',
      '주도적 개선 발굴, 사용자 관점 사고 인상적.',
    ],
    sales: [
      '신규 고객 발굴 의지 우수, 클로징 능력 향상 필요.',
      '시장 트렌드 파악 탁월, 영업 전략 기여 높음.',
      '고객 관계 관리 우수, 장기 고객 확보 강점.',
      '협상력 향상 중. 단가 협상 시 자신감 보강 필요.',
    ],
    hr: [
      '인사 업무 이해도 높음. 디테일 챙기는 능력 우수.',
      '직원 응대 공정성 유지. 비밀 유지 의식 철저.',
      '개선 제안 자주 함. 실행력 안정적.',
      '데이터 분석 역량 향상 중.',
    ],
    executive: [
      '전사 비전 수립과 실행 균형 우수.',
      '시장 통찰력 인상적, 신사업 발굴 탁월.',
      '리더십 강화 중. 의사결정 속도 향상.',
    ],
  };
  const pool = t[scenario] || t.hr;
  return pool[n % pool.length];
}

function selfReviewText(scenario) {
  const t = {
    development: '이번 분기 목표 80% 달성. 기술 도전 과제를 통해 역량을 키웠으며 팀 협업에서 적극적 역할을 했습니다. 다음 분기는 문서화와 코드 품질 개선에 집중하겠습니다.',
    sales: '분기 매출 90% 달성, 신규 고객사 4건 확보. 다음 분기는 협상력 강화와 업셀링 전략을 보완하겠습니다.',
    hr: '인사 시스템 도입과 평가 제도 개선 안정적 진행. 직원 만족도 조사 결과 긍정적. 데이터 기반 의사결정을 강화하겠습니다.',
    executive: '전사 매출 목표 달성, 신규 시장 진출 기반 마련. 임원진 협업과 의사결정 효율성을 강화했습니다.',
  };
  return t[scenario] || t.hr;
}

function mgrReviewText(scenario) {
  const t = {
    development: '핵심 프로젝트 기여 우수, 코드 품질 안정적. 향후 시스템 설계 역량 강화를 권장합니다.',
    sales: '영업 활동 매우 적극적. 분기 목표 달성에 핵심 기여. 대형 고객사 클로징 집중 권장.',
    hr: '안정적 업무 수행, 공정성 유지. 인사 데이터 활용 능력을 더 키우면 좋겠습니다.',
    executive: '전략 수립과 실행 안정적. 임원진 리더십 발휘 우수.',
  };
  return t[scenario] || t.hr;
}

function secondMgrReviewText(scenario) {
  const t = {
    development: '1차 평가자 의견에 동의. 기술 리더십 가능성 보임.',
    sales: '실적 우수, 향후 영업 리더 역할 가능성 평가.',
    hr: '안정적 수행, 인사 정책 기획 역량 강화 권장.',
    executive: '전사 성과 기여 인정.',
  };
  return t[scenario] || t.hr;
}

main();
