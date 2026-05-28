# CLAUDE_CODE_PROMPT_61B — 시드 + 운영 데이터 재계산 + 회귀 검증

## 실행 트리거

사용자가 "PROMPT 61B 진행해줘" 발언 시 본 PROMPT 시작.
**PROMPT 61A 완료가 전제** — server/index.js에 `calcFinalScore` 헬퍼 존재 확인 후 시작.
완료 후 회귀 검증 보고서 + "PROMPT 61A + 61B 일괄 푸시 승인 요청" 안내.
**자동 푸시 금지** — 사용자 명시 승인 후 수동 푸시.

---

## 작업 개요

PROMPT 61A에서 검증·점수 계산 로직을 새 공식으로 변경한 뒤, 시드 데이터와 기존 운영 데이터를 새 공식과 정합하게 보정.

**사용자 결정 사항 (2026-05-28)**:
- 시드 스크립트 weight 공식 변경: `(cat.weight * ratios[i]) / 100` → `ratios[i]`
- 시드 스크립트 final_score 스케일 통일: 1-6 → 0-100 (PROMPT 58 통계 회귀 검증 신뢰도 확보)
- 시드 재실행 전 자동 백업 (timestamp 디렉토리, 1주 보관)
- 기존 운영 데이터 `final_score` 새 공식으로 재계산, `selected_grade`는 유지 (관리자 수동 판단 존중)
- PROMPT 58 통계 회귀 확인

**PROMPT 61-PRE 핵심 재확인**:
- 시드 weight = 전체 환산 비중 (line 305, 309) → 새 검증과 불일치
- 시드 final_score = 1-6 랜덤 → 통계 회귀 검증의 노이즈
- 영향 사이클 72개, 목표 432개

## 작업 위험도: 높음 (DB 데이터 전면 교체 + 운영 데이터 재계산)
## 자동 푸시 여부: ❌ 금지 — 사용자 명시 승인 후 PROMPT 61A 커밋과 함께 일괄 푸시

---

## 코드 읽기 가이드 (압축 방지)

본 작업은 다음 영역만 읽고 진행. **전체 파일 view 금지**, view_range 필수.

### 분석 보고서로 확정된 line (PROMPT 61-PRE)
- **scripts/seed-eval-data.js line 100~115**: `cleanupOldData` (분석 보고서 §7)
- **scripts/seed-eval-data.js line 300~315**: ratios + weight 산출 (line 305, 309) (분석 보고서 §3)
- **scripts/seed-eval-data.js**: final_score 산출(`Math.max(1, Math.min(6, base + boost + noise))`) — line 미정, 사전 점검에서 확정

### 사전 점검에서 확정할 line (1회 grep)

```bash
# 시드 스크립트 내 final_score 산출 + scoreToGrade + insertedGoals 흐름
findstr /n "final_score\|scoreToGrade\|base + boost\|insertFinalEval\|INSERT INTO final_evaluations" scripts\seed-eval-data.js

# PROMPT 61A에서 추가한 calcFinalScore 위치 (재사용 가능 여부 판단)
findstr /n "function calcFinalScore" server\index.js
```

확정할 2가지:
1. **시드의 final_score 산출 블록 line 범위** — `base + boost + noise` 계산 ~ INSERT 직전까지
2. **시드의 scoreToGrade 함수 시그니처** — 1-6 스케일 받는지 0-100 스케일 받는지

**그 외 코드는 view 금지.** server/index.js 전체 view 금지, scripts 디렉토리 전체 view 금지.

### 신규 파일
- `scripts/recalc-final-scores.js` (신규 생성)

### 갱신 파일
- `scripts/seed-eval-data.js` (weight 공식 + final_score 산출)
- `.gitignore` (data/backups/ 추가, 없으면)
- `ClaudeHRM.md` (개발 이력)

---

## 변경 사항

### 1. 자동 백업 헬퍼 (scripts/seed-eval-data.js 상단)

기존 require 직후 추가:

```javascript
const fs = require('fs');
const path = require('path');

function backupDb() {
  const dbPath = path.resolve(__dirname, '../data/hrmanage.db');
  if (!fs.existsSync(dbPath)) {
    console.log('⚠ DB 파일 없음, 백업 건너뜀.');
    return null;
  }
  const backupDir = path.resolve(__dirname, '../data/backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const backupPath = path.join(backupDir, `hrmanage.${ts}.db`);
  fs.copyFileSync(dbPath, backupPath);

  // 1주 이상 된 백업 정리
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(backupDir)) {
    const fp = path.join(backupDir, f);
    if (fs.statSync(fp).mtimeMs < oneWeekAgo) {
      fs.unlinkSync(fp);
      console.log(`  ↳ 오래된 백업 제거: ${f}`);
    }
  }
  console.log(`✓ DB 백업: ${backupPath}`);
  return backupPath;
}
```

시드 진입점에서 `cleanupOldData()` 호출 직전에 `backupDb()` 1회 호출.

### 2. .gitignore 확인 (없으면 추가)

```
data/backups/
```

### 3. weight 공식 변경 (scripts/seed-eval-data.js line 305, 309)

**기존**:
```javascript
const ratios = Math.random() > 0.5 ? [70, 30] : [60, 40];
const weight = Math.round((cat.weight * ratios[i]) / 100);
```

**변경 후**:
```javascript
const ratios = Math.random() > 0.5 ? [70, 30] : [60, 40];
const weight = ratios[i];  // 카테고리 내 비중
```

### 4. final_score 산출 0-100 스케일 통일 (사전 점검에서 확정한 line)

**기존 (PROMPT 61-PRE 분석 인용)**:
```javascript
const score = Math.max(1, Math.min(6, base + boost + noise));  // 1-6 스케일
```

**변경 후**: mgr_score만 1-5 스케일로 산출, final_score는 calcSeedFinalScore로 계산.

#### a. `calcSeedFinalScore` 헬퍼 추가 (시드 스크립트 상단)

PROMPT 61A의 `calcFinalScore`와 동일 공식. 시드 컨텍스트는 raw goal 배열을 받음:

```javascript
/**
 * 시드용 final_score 계산 — server/index.js의 calcFinalScore와 동일 공식
 * @param {Array<{category_id, weight, mgr_score}>} goalScores
 * @param {Array<{id, weight}>} cats - 활성 카테고리
 * @returns {number} 0-100, 소수점 2자리
 */
function calcSeedFinalScore(goalScores, cats) {
  const catWeightMap = new Map(cats.map(c => [c.id, c.weight]));
  const byCat = new Map();
  for (const g of goalScores) {
    if (!byCat.has(g.category_id)) byCat.set(g.category_id, []);
    byCat.get(g.category_id).push(g);
  }
  let finalScore = 0;
  let usedCatWeightSum = 0;
  for (const [catId, gs] of byCat) {
    const catW = catWeightMap.get(catId);
    if (!catW) continue;
    const totalInner = gs.reduce((a, g) => a + g.weight, 0) || 1;
    const catScore = gs.reduce(
      (a, g) => a + (g.mgr_score / 5 * 100) * (g.weight / totalInner), 0
    );
    finalScore += catScore * (catW / 100);
    usedCatWeightSum += catW;
  }
  if (usedCatWeightSum > 0 && usedCatWeightSum < 100) {
    finalScore = finalScore * (100 / usedCatWeightSum);
  }
  return Math.round(finalScore * 100) / 100;
}
```

#### b. final_score 산출 블록 교체

사전 점검에서 확정한 line 영역을 다음 패턴으로 교체:

```javascript
// 변경 후: goal별 mgr_score 산출 → final_eval_scores 저장 → final_score 계산
const goalScores = [];
for (const goal of insertedGoals) {
  const base = getBaseScore(scenario);          // 1-5 스케일 시나리오
  const boost = getTrendBoost(scenario, qIdx);
  const noise = (Math.random() - 0.5) * 0.4;
  const mgrScore = Math.max(1, Math.min(5, base + boost + noise));

  db.prepare(`
    INSERT INTO final_eval_scores (eval_id, goal_id, self_score, mgr_score)
    VALUES (?, ?, ?, ?)
  `).run(evalId, goal.id, mgrScore, mgrScore);

  goalScores.push({
    category_id: goal.category_id,
    weight: goal.weight,
    mgr_score: mgrScore
  });
}

const finalScore = calcSeedFinalScore(goalScores, activeCats);
const finalGrade = scoreToGrade(finalScore, activeGrades);  // 0-100 스케일 받도록 보정 필요 시 함께 수정
db.prepare(`
  UPDATE final_evaluations
  SET final_score = ?, final_grade = ?, selected_grade = ?
  WHERE eval_id = ?
`).run(finalScore, finalGrade, finalGrade, evalId);
```

#### c. scoreToGrade 호환성 처리

사전 점검에서 시드의 `scoreToGrade`가 1-6 스케일 받는 함수라면 0-100 스케일 받도록 보정:

```javascript
function scoreToGrade(score, activeGrades) {
  // 0-100 스케일 기준 (activeGrades가 boundary 정의하면 그것 사용, 아니면 기본 매핑)
  if (activeGrades && activeGrades.length > 0) {
    // 등급별 cutoff 적용 (기존 활성 등급 분기 로직 유지)
    for (const g of activeGrades) {
      if (score >= g.min_score) return g.code;
    }
    return activeGrades[activeGrades.length - 1].code;
  }
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}
```

기존 `activeGrades` 조회/구조가 다르면 사전 점검 결과 기반으로 맞춰 보정.

### 5. 운영 데이터 재계산 스크립트 (scripts/recalc-final-scores.js 신규)

```javascript
/**
 * 운영 평가 데이터의 final_score를 새 공식으로 재계산
 * - selected_grade는 NULL인 경우만 새 등급으로 채움 (관리자 수동 판단 보존)
 * - final_grade는 새 final_score 기준 재산출
 * - 자동 백업 선행
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/hrmanage.db');

// 백업
const backupDir = path.resolve(__dirname, '../data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const backupPath = path.join(backupDir, `hrmanage.recalc-${ts}.db`);
fs.copyFileSync(DB_PATH, backupPath);
console.log(`✓ 백업: ${backupPath}`);

const db = new Database(DB_PATH);

const cats = db.prepare('SELECT id, weight FROM goal_categories WHERE is_active=1').all();
const catWeightMap = new Map(cats.map(c => [c.id, c.weight]));

function recalc(evalId) {
  const rows = db.prepare(
    `SELECT g.weight, g.category_id, fes.mgr_score AS score
     FROM goals g
     JOIN final_eval_scores fes ON fes.goal_id = g.id
     WHERE g.eval_id = ? AND fes.mgr_score IS NOT NULL`
  ).all(evalId);
  if (rows.length === 0) return null;

  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.category_id)) byCat.set(r.category_id, []);
    byCat.get(r.category_id).push(r);
  }
  let fs_ = 0, used = 0;
  for (const [catId, gs] of byCat) {
    const catW = catWeightMap.get(catId);
    if (!catW) continue;
    const totalInner = gs.reduce((a, g) => a + g.weight, 0) || 1;
    const catScore = gs.reduce(
      (a, g) => a + (g.score / 5 * 100) * (g.weight / totalInner), 0
    );
    fs_ += catScore * (catW / 100);
    used += catW;
  }
  if (used > 0 && used < 100) fs_ = fs_ * (100 / used);
  return Math.round(fs_ * 100) / 100;
}

function scoreToGrade(score) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

const evals = db.prepare(`SELECT eval_id, selected_grade FROM final_evaluations`).all();
let updated = 0;
const tx = db.transaction(() => {
  for (const ev of evals) {
    const newScore = recalc(ev.eval_id);
    if (newScore === null) continue;
    const newGrade = scoreToGrade(newScore);
    db.prepare(`
      UPDATE final_evaluations
      SET final_score = ?, final_grade = ?,
          selected_grade = COALESCE(selected_grade, ?)
      WHERE eval_id = ?
    `).run(newScore, newGrade, newGrade, ev.eval_id);
    updated++;
  }
});
tx();
console.log(`✓ 재계산 완료: ${updated}건`);
db.close();
```

### 6. 실행 순서

**중요**: 서버 정지 후 진행.

1. 서버 정지 (`docker-compose stop` 또는 nodemon 중지)
2. **운영 데이터 재계산 먼저**: `node scripts/recalc-final-scores.js`
3. 콘솔 로그 확인 (백업 경로, 재계산 건수)
4. **시드 재실행**: `node scripts/seed-eval-data.js`
5. 백업 자동 생성 확인
6. 시드 결과 SQL 검증 (아래)
7. 서버 재시작

순서 사유: 시드 재실행은 cleanupOldData로 기존 운영 데이터를 삭제. 재계산이 먼저 일어나야 운영 환경에서 의미 있음. 개발 환경(시드만 있는 경우)에서는 시드 재실행만으로 충분.

### 7. SQL 검증

시드 재실행 직후:

```sql
-- weight 분포 확인
SELECT MAX(weight) AS max_w, MIN(weight) AS min_w, ROUND(AVG(weight), 1) AS avg_w
FROM goals;
-- 기대: max=70, min=30 (또는 60/40), avg ≈ 50

-- final_score 분포
SELECT
  ROUND(AVG(final_score), 1) AS avg_score,
  MAX(final_score) AS max_score,
  MIN(final_score) AS min_score,
  COUNT(*) AS cnt
FROM final_evaluations;
-- 기대: 0-100 범위, cnt = 64 (8명 × 8분기 final)

-- 등급 분포
SELECT final_grade, COUNT(*) AS cnt
FROM final_evaluations
GROUP BY final_grade ORDER BY final_grade;
-- 기대: S/A/B/C/D 분포, 시나리오 의도 반영
```

### 8. PROMPT 58 통계 회귀 검증

화면 진입 후 다음 6개 확인:

| # | 시나리오 | 확인 |
|---|---------|------|
| 1 | `/api/perf/org-tree` 회사 노드 | avg_score 1.0~5.0 범위, NaN 없음 |
| 2 | 본부별 avg_score | 본부 간 의미 있는 차이 |
| 3 | 팀별 avg_score | 팀 간 의미 있는 차이 |
| 4 | `/api/perf/quarterly-trend` | 8기간 데이터 정상 표시 |
| 5 | 등급 분포 차트 | S/A/B/C/D 시나리오 의도 반영 |
| 6 | `/api/perf/ai-summary` | 정상 응답 (이전과 형태 동일) |

**평균값 변화는 정상** (공식 변경). **분포 형태(등급 비율)가 시드 시나리오와 일치**해야 함. 모든 평균이 같은 값으로 수렴하거나 단일 등급에 몰리면 시드 로직 버그.

### 9. 회귀 검증 보고서 (사용자에게 제출)

```
PROMPT 61B 회귀 검증 결과

1. 시드 재실행: 72 사이클, 모두 성공
2. 백업: data/backups/hrmanage.YYYY-MM-DD-hh-mm-ss.db
3. weight 분포: max=70, min=30, avg=50.0
4. final_score 분포: max=XX.X, min=XX.X, avg=XX.X
5. 등급 분포: S=N건, A=N건, B=N건, C=N건, D=N건
6. PROMPT 58 통계 화면:
   - 회사 평균: X.X점 (이전 X.X점)
   - 분기별 추이: 8기간 정상
   - 등급 분포 차트: 정상
   - AI 요약: 정상

PROMPT 61A + 61B 일괄 푸시 승인 요청.
```

### 10. ClaudeHRM.md 갱신

#### a. 개발 이력 1줄 추가 (최상단)
```
| 2026-05-28 | 시드 weight·점수 스케일 통일 + 운영 데이터 재계산 + 자동 백업 (PROMPT 61B) | Claude Code |
```

#### b. 해당 섹션 있으면 갱신
- 시드 데이터 weight 의미: "카테고리 내 비중" 명시
- 시드 final_score: "0-100 스케일, calcSeedFinalScore" 명시

### 11. Git 커밋 (PROMPT 61A 커밋과 별도, 푸시는 사용자 승인 대기)

```bash
git add scripts/ ClaudeHRM.md .gitignore
git commit -m "시드 weight·점수 스케일 통일 + 운영 데이터 재계산 (PROMPT 61B)"
# git push 금지 — 사용자 승인 후 일괄
```

---

## 작업 절차

1. **PROMPT 61A 완료 확인** — `grep "function calcFinalScore" server/index.js` 1회로 확인
2. **사전 점검 grep** — 시드 final_score 산출 line + scoreToGrade 시그니처 확정
3. **시드 스크립트 수정** — backupDb + weight 공식 + calcSeedFinalScore + final_score 산출 블록 교체 + scoreToGrade 보정
4. **.gitignore 보정** — data/backups/ 추가 (없으면)
5. **recalc-final-scores.js 신규 작성**
6. **서버 정지**
7. **운영 데이터 재계산 실행** — 결과 확인
8. **시드 재실행** — 백업 자동 생성 확인 + SQL 검증
9. **서버 재시작**
10. **PROMPT 58 통계 회귀 시나리오 1~6 확인**
11. **회귀 검증 보고서 작성**
12. **ClaudeHRM.md 갱신**
13. **Git 커밋만**
14. **"PROMPT 61A + 61B 완료, 일괄 푸시 승인 요청" 보고**

---

## 작업 완료 체크리스트

- [ ] PROMPT 61A 완료 확인 (calcFinalScore 존재)
- [ ] 사전 점검 grep 1회, line 확정
- [ ] backupDb 함수 추가
- [ ] 시드 weight 공식 변경
- [ ] calcSeedFinalScore 헬퍼 추가
- [ ] 시드 final_score 산출 블록 0-100 스케일로 교체
- [ ] scoreToGrade 호환성 보정
- [ ] .gitignore data/backups/ 추가 (없으면)
- [ ] recalc-final-scores.js 신규 작성
- [ ] 운영 데이터 재계산 실행 + 결과 확인
- [ ] 시드 재실행 + SQL 검증
- [ ] PROMPT 58 통계 회귀 1~6 확인
- [ ] 회귀 검증 보고서 작성
- [ ] ClaudeHRM.md 개발 이력 추가
- [ ] git commit (푸시 금지)
- [ ] "일괄 푸시 승인 요청" 보고

---

## 주의사항

- **자동 푸시 절대 금지** — DB 데이터 변경 + 마이그레이션성 스크립트. 사용자 명시 승인 후 수동 푸시
- **재계산 스크립트는 idempotent** — 두 번 실행해도 결과 동일, 단 백업은 매번 누적
- **selected_grade 보존** — `COALESCE(selected_grade, ?)`로 NULL일 때만 신규 등급으로 채움 (관리자 수동 판단 보존)
- **재계산 중 서버 정지 필수** — 동시 쓰기 충돌 방지
- **시드 재실행은 cleanupOldData가 작동** — 기존 평가 데이터 삭제됨, 백업 필수
- **운영 데이터 재계산 vs 시드 재실행은 별개** — 운영 DB는 재계산만, 개발 환경에서는 시드 재실행
- **평균값 변화는 정상** (공식 변경), **분포 형태는 시드 시나리오와 일치해야 함**
- **개인정보 보호** — 재계산 스크립트 로그에 이름/이메일 출력 금지, eval_id만 사용. 백업 파일은 `data/backups/` (Git 제외)

---

## 다음 단계

PROMPT 61B 완료 + 일괄 푸시 완료 후:
- weight 의미 통일 작업 종료
- 시드 시나리오 강도/분포 튜닝 필요 시 별도 PROMPT
- 다음 우선순위 결정 (PROMPT 62 등)
