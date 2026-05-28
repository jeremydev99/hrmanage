# CLAUDE_CODE_PROMPT_61A — Weight 의미 통일 (검증 + 점수 계산 로직)

## 실행 트리거

사용자가 "PROMPT 61A 진행해줘" 발언 시 본 PROMPT 시작.
완료 후 "PROMPT 61A 완료" 보고 + "PROMPT 61B 진행 가능" 안내.
**푸시 금지** — PROMPT 61B 완료 후 사용자 확인하고 일괄 푸시.

---

## 작업 개요

PROMPT 61-PRE 분석 보고서 결과 반영. `goals.weight`를 **카테고리 내 100%** 의미로 통일하고, 점수 계산 시 `goal_categories.weight`를 명시적으로 적용하도록 백엔드 로직 변경.

**사용자 결정 사항 (2026-05-28)**:
- weight = **카테고리 내 100%** (예: 업적목표 카테고리 안에서 70% + 30%)
- 카테고리 가중치(50%, 30%, 20%)는 그대로 유지
- 점수 계산: `Σ(카테고리 가중치/100 × Σ(목표 점수/5×100 × 카테고리 내 weight/100))`
- 카테고리당 최소 1개 목표 강제
- 기존 운영 데이터 `final_score`는 새 공식으로 재계산, `selected_grade` 유지 (PROMPT 61B)

**PROMPT 61-PRE 핵심 발견**:
- 현재 점수 계산은 `goal_categories.weight`를 전혀 조인하지 않음 (server/index.js line 1103–1113)
- 시드 데이터가 "전체 환산 비중"으로 저장되어 우연히 맞아떨어지는 구조
- UI와 백엔드 검증 간 의미 불일치가 이미 존재 (UI는 카테고리별, 백엔드는 전체 합)

## 작업 위험도: 중간 (핵심 비즈니스 로직 변경)
## 자동 푸시 여부: ⚠️ 회색 — PROMPT 61B와 함께 사용자 확인 후 일괄 푸시

---

## 코드 읽기 가이드 (압축 방지)

본 작업은 다음 영역만 읽고 진행. **전체 파일 view 금지**, view_range 필수.

### 분석 보고서로 확정된 line (PROMPT 61-PRE)
- **server/index.js line 590~610**: `validateEvalGoals` 헬퍼 본문 (분석 보고서 §5)
- **server/index.js line 1100~1115**: 관리자 제출 시 점수 계산 (분석 보고서 §1)
- **public/js/pages/my-eval.js line 318~345**: 카테고리별 합계 표시 (분석 보고서 §2)

### 사전 점검에서 확정할 line (1차 grep 1회로 일괄 확정)

다음 keyword를 1회 grep으로 한꺼번에 확인 후 결과를 채팅에 보고하고 본 PROMPT 본문 line을 갱신해 진행:

```bash
# Windows (PowerShell 사용 시 select-string)
findstr /n "scoreToGrade calcFinalScore final_score=\|saveAllGoals submit\|api/evals/.*submit\|api/approvals/.*approve" server\index.js

findstr /n "score\|final_score" server\adapters\prisma\PrismaFinalEvaluationRepository.js

findstr /n "saveBtn\|submitGoals\|allValid\|wt-err\|totalW" public\js\pages\my-eval.js
```

확정해야 할 4가지:
1. **server/index.js의 등급 매핑 함수 위치** (90+:S, 80+:A 등 또는 활성 등급 매핑) — `calcFinalScore` 옆에 둘 신규 헬퍼와 충돌 없게 확인
2. **server/index.js의 self_score / second_mgr_score 기반 final_score 산출 호출부 존재 여부**
3. **PrismaFinalEvaluationRepository.js의 점수 계산 로직 유무** — 있으면 동일 공식으로 보정
4. **my-eval.js의 저장 버튼 활성화 조건 line** — 또는 submit 핸들러의 클라이언트 사전 검증 line

**그 외 코드는 절대 view 하지 말 것.** server/index.js 전체 view 금지, Repository 어댑터 8개 일괄 view 금지.

---

## 변경 사항

### 1. `validateEvalGoals` 헬퍼 변경 (server/index.js line 590~610)

**기존**: 전체 가중치 합 = 100 검증

```javascript
const totalWeight = goals.reduce((sum, g) => sum + (Number(g.weight) || 0), 0);
if (Math.abs(totalWeight - 100) > 0.01)
  return { valid: false, error: `목표 가중치 합이 100이 되어야 합니다. (현재: ${totalWeight.toFixed(2)})` };
```

**변경 후**: 카테고리별 합 = 100 + 카테고리당 최소 1개 + 활성 카테고리 모두 포함

```javascript
// 활성 카테고리 모두 조회
const activeCats = db.prepare(
  'SELECT id, name, weight FROM goal_categories WHERE is_active=1 ORDER BY id'
).all();
if (activeCats.length === 0) {
  return { valid: false, error: '활성 카테고리가 없습니다.' };
}

// 카테고리별 그룹화
const goalsByCat = new Map();
for (const g of goals) {
  if (!g.category_id) {
    return { valid: false, error: `목표 "${g.name || '(이름 없음)'}"에 카테고리가 지정되지 않았습니다.` };
  }
  if (!goalsByCat.has(g.category_id)) goalsByCat.set(g.category_id, []);
  goalsByCat.get(g.category_id).push(g);
}

// 활성 카테고리별 검증
for (const cat of activeCats) {
  const catGoals = goalsByCat.get(cat.id) || [];
  if (catGoals.length === 0) {
    return { valid: false, error: `"${cat.name}" 카테고리에 최소 1개의 목표를 입력해야 합니다.` };
  }
  const catSum = catGoals.reduce((a, g) => a + (Number(g.weight) || 0), 0);
  if (Math.abs(catSum - 100) > 0.01) {
    return {
      valid: false,
      error: `"${cat.name}" 카테고리의 가중치 합이 100이 되어야 합니다. (현재: ${catSum.toFixed(2)})`
    };
  }
}

// 기존 검증 유지 (name, weight>0)
for (const g of goals) {
  if (!g.name || !String(g.name).trim()) {
    return { valid: false, error: '목표 이름이 비어 있는 항목이 있습니다.' };
  }
  if (!(Number(g.weight) > 0)) {
    return { valid: false, error: `목표 "${g.name}"의 가중치가 0 또는 음수입니다.` };
  }
}
```

호출부 변경 없음.

### 2. `calcFinalScore` 헬퍼 신규 (server/index.js)

위치: `validateEvalGoals` 인접 (line 610 근처).

```javascript
/**
 * 평가 사이클의 final_score 계산
 * 공식: Σ(카테고리 가중치/100 × Σ(목표 점수/5*100 × 카테고리 내 weight/100))
 * @param {number} evalId
 * @param {string} scoreField - 'mgr_score' | 'self_score' | 'second_mgr_score'
 * @returns {number|null} 0-100 스케일, 소수점 2자리. 점수 없으면 null
 */
function calcFinalScore(evalId, scoreField = 'mgr_score') {
  const rows = db.prepare(
    `SELECT g.weight, g.category_id, fes.${scoreField} AS score
     FROM goals g
     JOIN final_eval_scores fes ON fes.goal_id = g.id
     WHERE g.eval_id = ? AND fes.${scoreField} IS NOT NULL`
  ).all(evalId);
  if (rows.length === 0) return null;

  const cats = db.prepare(
    'SELECT id, weight FROM goal_categories WHERE is_active=1'
  ).all();
  const catWeightMap = new Map(cats.map(c => [c.id, Number(c.weight) || 0]));

  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.category_id)) byCat.set(r.category_id, []);
    byCat.get(r.category_id).push(r);
  }

  let finalScore = 0;
  let usedCatWeightSum = 0;
  for (const [catId, catGoals] of byCat) {
    const catW = catWeightMap.get(catId);
    if (!catW) continue;
    const totalInnerW = catGoals.reduce((a, g) => a + (Number(g.weight) || 0), 0) || 1;
    const catScore = catGoals.reduce(
      (a, g) => a + (Number(g.score) / 5 * 100) * (Number(g.weight) / totalInnerW),
      0
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

### 3. 점수 계산 호출부 교체 (server/index.js line 1100~1115)

**기존**:
```javascript
const goals = db.prepare(`SELECT g.weight, fes.mgr_score ...`).all(ev.id);
const totalW = goals.reduce((a, g) => a + g.weight, 0) || 1;
const score  = goals.reduce((a, g) => a + (g.mgr_score / 5 * 100) * (g.weight / totalW), 0);
```

**변경 후**:
```javascript
const score = calcFinalScore(ev.id, 'mgr_score');
if (score === null) {
  return res.status(400).json({ error: '관리자 점수가 입력되지 않았습니다.' });
}
```

### 4. 추가 호출부 점검 (사전 점검 결과에 따라)

사전 점검에서 `self_score`/`second_mgr_score`로 final_score 산출하는 부분 발견 시 같은 헬퍼로 교체:
```javascript
const selfScore = calcFinalScore(evalId, 'self_score');
const secondScore = calcFinalScore(evalId, 'second_mgr_score');
```

`PrismaFinalEvaluationRepository.js`에 점수 계산 로직이 있다면 동일 공식으로 보정.

### 5. UI 보정 (public/js/pages/my-eval.js line 318~345 + 사전 점검 line)

**카테고리별 합계 표시는 변경 없음** (line 320~340 영역, 이미 정상).

**저장 버튼 활성화 조건**: 사전 점검에서 확정한 line에서 다음 조건으로 교체:

```javascript
const allCatsValid = activeCats.every(cat => {
  const catGoals = _goals[cat.id] || [];
  if (catGoals.length === 0) return false;
  const sum = catGoals.reduce((a, g) => a + Number(g.weight || 0), 0);
  return Math.abs(sum - 100) < 0.01;
});
// 저장 버튼 disabled = !allCatsValid;
```

전체 합 100 검증이 별도로 있다면 제거.

### 6. ClaudeHRM.md 갱신

#### a. 설계 원칙 21번 교체 (현재 line 356)
```
21. **목표 입력 검증** (2026-05-27 PROMPT 58D → 2026-05-28 PROMPT 61A 보강):
    평가 제출(`/api/evals/:id/submit`) 및 1차 승인(`/api/approvals/:evalId/approve`) 시 `validateEvalGoals(evalId)` 헬퍼로 검증.
    규칙:
    - 활성 카테고리당 목표 ≥ 1개
    - 카테고리별 가중치 합 = 100 (오차 ±0.01) — **카테고리 내 비중 의미**
    - name 필수, weight > 0
    - kpi는 선택적 (정성 목표 허용)
```

#### b. 설계 원칙 24번 신규 추가 (23번 뒤)
```
24. **점수 계산 공식** (2026-05-28, PROMPT 61A):
    - 공식: `final_score = Σ(카테고리 가중치/100 × Σ(목표 점수/5×100 × 카테고리 내 weight/100))`
    - 헬퍼: `calcFinalScore(evalId, scoreField)` (scoreField: mgr_score | self_score | second_mgr_score)
    - 0-100 스케일, 소수점 2자리 반올림
    - 부분 평가 시 평가된 카테고리 가중치 합으로 정규화
    - 등급 매핑: 90+:S, 80+:A, 70+:B, 60+:C, else:D (또는 활성 등급)
    - `goal_categories.weight`(50/30/20)와 `goals.weight`(카테고리 내 100%)는 의미가 다름에 주의
```

#### c. 개발 이력 1줄 추가 (최상단)
```
| 2026-05-28 | weight 카테고리 내 100% 통일 — 검증·점수 계산 로직 변경 (calcFinalScore 헬퍼) (PROMPT 61A) | Claude Code |
```

### 7. Git 커밋 (푸시 보류)

```bash
git add server/index.js public/js/pages/my-eval.js ClaudeHRM.md
git commit -m "weight 카테고리 내 100% 통일 + 점수 계산 로직 변경 (PROMPT 61A)"
# git push 금지 — PROMPT 61B 완료 후 일괄
```

---

## 작업 절차

1. **사전 점검 (grep 1회)** — 위 grep 명령 실행, 미확정 line 4개 확보, 채팅에 결과 1줄 보고
2. **백엔드 변경** — `calcFinalScore` 추가 → `validateEvalGoals` 교체 → 점수 호출부 교체
3. **추가 호출부 점검** — self_score/second_mgr_score/Repository 어댑터, 사전 점검 결과에 따라 교체
4. **프론트엔드 변경** — 저장 버튼 활성화 조건 교체
5. **검증 시나리오 실행**
6. **ClaudeHRM.md 갱신** (3개 항목)
7. **Git 커밋만** (푸시 금지)
8. **"PROMPT 61A 완료, PROMPT 61B 진행 가능" 보고**

---

## 검증 시나리오

기존 시드 데이터 기준:

1. **신규 평가 정상**: A(70+30), B(100), C(60+40) → 제출/승인 성공
2. **카테고리 누락**: B에 목표 없음 → `"성장목표" 카테고리에 최소 1개의 목표를 입력해야 합니다.`
3. **카테고리 합 불일치**: A(70+20=90) → `"업적목표" 카테고리의 가중치 합이 100이 되어야 합니다. (현재: 90.00)`
4. **점수 계산 정확성**: 모든 mgr_score=4 → 80점
5. **부분 평가**: A만 점수 → 단일 카테고리 점수와 동일 (정규화)
6. **기존 시드 데이터 호환**: 일시적 검증 실패 정상 (PROMPT 61B 시드 재실행으로 해결)
7. **PROMPT 58D 회귀**: 목표 0개·name 빈 값·weight ≤ 0 차단 유지

---

## 작업 완료 체크리스트

- [ ] 사전 점검 grep 1회, 미확정 line 4개 확정 + 채팅 보고
- [ ] `calcFinalScore` 헬퍼 추가
- [ ] `validateEvalGoals` 카테고리별 검증으로 교체
- [ ] 점수 계산 호출부 교체 (server/index.js line 1100~1115)
- [ ] self_score/second_mgr_score 호출부 점검·교체 (있는 경우)
- [ ] Repository 어댑터 점수 계산 동기화 (있는 경우)
- [ ] my-eval.js 저장 버튼 활성화 조건 교체
- [ ] 검증 시나리오 1~7 통과
- [ ] ClaudeHRM.md 설계 원칙 21번 교체
- [ ] ClaudeHRM.md 설계 원칙 24번 신규 추가
- [ ] ClaudeHRM.md 개발 이력 1줄 추가
- [ ] git commit (푸시 금지)
- [ ] "PROMPT 61A 완료, PROMPT 61B 진행 가능" 보고

---

## 주의사항

- **푸시 금지** — PROMPT 61B 완료 후 일괄
- **기존 시드 데이터 신규 제출 시 일시적 실패는 정상** — 61B 재실행으로 해결
- **goal.category_id NULL 차단** — 검증 단계에서 막힘
- **개인정보 보호** — `HRPRIVACY_PRINCIPLES.md` 기존 권한 체계 유지
- **PROMPT 58 통계 회귀 검증은 61B에서**

---

## 다음 단계

PROMPT 61A 완료 후 → **PROMPT 61B**: 시드 weight·스케일 통일 + 자동 백업 + 시드 재실행 + 운영 데이터 재계산 + PROMPT 58 통계 회귀 검증.
