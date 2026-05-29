# CLAUDE_CODE_PROMPT_63A — 등급 정책 시점별 바인딩 (DB + 라우터 + 시드 + 산출 로직 통일)

## 실행 트리거

사용자가 "PROMPT 63A 진행해줘" 발언 시 본 PROMPT 시작.
완료 후 "PROMPT 63A 완료" 보고 + PROMPT 63B(관리자 UI) 진행 가능 안내.

---

## 작업 개요

PROMPT 63-PRE 분석 + 사용자 결정 사항(2026-05-29)에 따라 등급 산출 체계를 전면 재구성. 본 PROMPT는 **3단계 분리 중 1단계** — 데이터 모델, 라우터, 시드, 산출 로직 통일까지만. UI는 PROMPT 63C에서 별도 처리.

**핵심 변경**:
1. `grade_criteria` 테이블 폐기, `grade_policies` + `grade_policy_criteria` 신규
2. 평가 기간(`eval_periods`)에 정책 바인딩 컬럼 추가 — 정책 없으면 활성화 불가
3. `scoreToGrade` 단일 함수로 통일 (server + scripts 모두 grade_policy_criteria 참조)
4. `server/index.js:1171`의 S/A/B/C/D 하드코딩 제거 (PROMPT 63-PRE 핵심 발견)
5. `codeToScore` 폐기 (사용처 0곳, 옵션 A)
6. 시드 스크립트 재실행 시 디폴트 정책("사이냅 표준안") 생성 + 모든 기존 eval_periods에 자동 바인딩
7. 기존 운영 데이터 final_evaluations 재산출 **안 함** — 그대로 보존

**핵심 설계 원칙**:
- 평가 기간 1:N 등급 정책 (정책 1개를 여러 기간이 공유 가능)
- 정책 적용 시점: 평가 제출 시점에 `eval.period_id` → `eval_periods.grade_policy_id` → `grade_policy_criteria` lookup
- 기존 저장된 `final_grade`는 보존 — 정책 변경이 과거 데이터를 덮어쓰지 않음

## 작업 위험도: 중 (DB 마이그레이션 + 산출 함수 교체, 운영 데이터 재산출 없음)
## 자동 푸시 여부: ❌ 사용자 명시 승인 후 (DB 스키마 변경)

---

## 코드 읽기 가이드 (압축 방지)

본 작업은 PROMPT 63-PRE 분석 결과로 line 번호 대부분 확정. 다음 영역만 좁게 읽고 진행:

### 백엔드 (server/index.js)
- line 1148, 1171 — final_grade 산출부 (S/A/B/C/D 하드코딩)
- line 2123~2138 — buildGradeMap 정의
- line 2128~2129 — codeToScore 정의
- line 2131~2135 — buildGradeMap.scoreToGrade
- line 2162 — calcGradeStats 구조분해
- line 2232, 2297, 2346, 2426 — gm 호출처 (gm.maxScore, gm.gradeCodes 사용)
- line 2931~2940 — CREATE TABLE grade_criteria
- line 3015~3022 — grade_criteria 시드 INSERT
- `/api/grade-criteria` CRUD 라우터 4개 — 사전 점검 grep으로 line 확정
- `/api/eval-periods` 라우터들 — 사전 점검 grep으로 line 확정 (POST 생성, PATCH toggle)

### Prisma
- `prisma/schema.prisma` line 285~294 — grade_criteria 모델
- eval_periods 모델 — 사전 점검 grep

### 시드 스크립트
- `scripts/seed-eval-data.js` line 443 — scoreToGrade 시드 호출
- `scripts/seed-eval-data.js` line 479~484 — scoreToGrade 함수 정의
- `scripts/seed-eval-data.js` loadGrades 함수 — grep 확정
- eval_periods 시드 INSERT 부분 — grep 확정

### 재계산 스크립트
- `scripts/recalc-final-scores.js` line 61~67, 77 — scoreToGrade 함수 + 호출

### 사전 점검 grep (4회 이내)

```bash
# 1) /api/grade-criteria 라우터 4개 line 확정
findstr /n "/api/grade-criteria" server\index.js

# 2) /api/eval-periods 라우터 line 확정 (POST 생성, PATCH toggle)
findstr /n "/api/eval-periods" server\index.js

# 3) eval_periods CREATE TABLE + 시드 INSERT
findstr /n "CREATE TABLE.*eval_periods\|INSERT INTO eval_periods" server\index.js scripts\seed-eval-data.js

# 4) loadGrades + grade_criteria 참조 전수
findstr /s /n "loadGrades\|grade_criteria" server\index.js scripts\ prisma\
```

**전체 파일 view 금지**. view_range로 함수 단위만 읽기. Prisma 어댑터 8개 일괄 view 금지.

---

## 변경 사양

### 1. DB 스키마 변경

#### 1-1. grade_policies 신규 테이블

```sql
CREATE TABLE IF NOT EXISTS grade_policies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  created_by  INTEGER REFERENCES users(id)
);
```

#### 1-2. grade_policy_criteria 신규 테이블

```sql
CREATE TABLE IF NOT EXISTS grade_policy_criteria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id   INTEGER NOT NULL REFERENCES grade_policies(id) ON DELETE CASCADE,
  grade_code  TEXT NOT NULL,
  grade_name  TEXT NOT NULL,
  min_score   REAL NOT NULL CHECK (min_score >= 0 AND min_score <= 100),
  sort_order  INTEGER NOT NULL,
  description TEXT,
  note        TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(policy_id, grade_code),
  UNIQUE(policy_id, sort_order)
);
```

설계 노트:
- `UNIQUE(policy_id, grade_code)`: 한 정책 안에서 같은 등급 코드 중복 불가
- `UNIQUE(policy_id, sort_order)`: 한 정책 안에서 같은 sort_order 중복 불가
- `ON DELETE CASCADE`: 정책 삭제 시 cutoff도 함께 삭제

#### 1-3. eval_periods 컬럼 추가

```sql
ALTER TABLE eval_periods ADD COLUMN grade_policy_id INTEGER REFERENCES grade_policies(id);
```

NULLABLE — 기존 행은 NULL로 들어감. 시드 재실행 시 디폴트 정책으로 일괄 바인딩(아래 §3).

#### 1-4. grade_criteria 폐기

```sql
DROP TABLE IF EXISTS grade_criteria;
```

CREATE TABLE 코드(server/index.js line 2931~2940)와 시드 INSERT(line 3015~3022)도 함께 제거.

#### 1-5. Prisma schema 동기화

`prisma/schema.prisma`에서:
- line 285~294의 `model GradeCriteria` 제거
- 신규 모델 추가:

```prisma
model GradePolicy {
  id           Int      @id @default(autoincrement())
  name         String   @unique
  description  String?
  createdAt    DateTime @default(now()) @map("created_at")
  createdBy    Int?     @map("created_by")
  creator      User?    @relation(fields: [createdBy], references: [id])
  criteria     GradePolicyCriteria[]
  evalPeriods  EvalPeriod[]
  @@map("grade_policies")
}

model GradePolicyCriteria {
  id          Int      @id @default(autoincrement())
  policyId    Int      @map("policy_id")
  policy      GradePolicy @relation(fields: [policyId], references: [id], onDelete: Cascade)
  gradeCode   String   @map("grade_code")
  gradeName   String   @map("grade_name")
  minScore    Float    @map("min_score")
  sortOrder   Int      @map("sort_order")
  description String?
  note        String?
  createdAt   DateTime @default(now()) @map("created_at")
  @@unique([policyId, gradeCode])
  @@unique([policyId, sortOrder])
  @@map("grade_policy_criteria")
}
```

- `model EvalPeriod`에 필드 추가:
```prisma
  gradePolicyId Int?         @map("grade_policy_id")
  gradePolicy   GradePolicy? @relation(fields: [gradePolicyId], references: [id])
```

- `model User`에 역참조 추가:
```prisma
  createdGradePolicies GradePolicy[]
```

### 2. 산출 로직 통일

#### 2-1. 신규 헬퍼: `getPolicyForEval(evalId)` (server/index.js)

`buildGradeMap` 근처(line 2123 부근)에 추가:

```javascript
/**
 * 평가 ID로부터 적용 등급 정책 조회.
 * eval.period_id → eval_periods.grade_policy_id → grade_policies + criteria
 * @returns {Object|null} { id, name, criteria: [{grade_code, grade_name, min_score, sort_order}, ...] } 또는 null
 */
function getPolicyForEval(evalId) {
  const row = db.prepare(`
    SELECT gp.id, gp.name
    FROM evals e
    JOIN eval_periods ep ON ep.id = e.period_id
    JOIN grade_policies gp ON gp.id = ep.grade_policy_id
    WHERE e.id = ?
  `).get(evalId);
  if (!row) return null;
  const criteria = db.prepare(`
    SELECT grade_code, grade_name, min_score, sort_order
    FROM grade_policy_criteria
    WHERE policy_id = ?
    ORDER BY min_score DESC
  `).all(row.id);
  return { id: row.id, name: row.name, criteria };
}
```

#### 2-2. 신규 헬퍼: `scoreToGrade(score, policy)` (server/index.js, 단일 진실)

```javascript
/**
 * 점수→등급 변환 (정책 기반 단일 진실 함수).
 * @param {number} score 0~100
 * @param {Object} policy { criteria: [{grade_code, min_score}, ...], sorted by min_score DESC }
 * @returns {string|null} grade_code 또는 null (매칭 등급 없음)
 */
function scoreToGrade(score, policy) {
  if (score == null || isNaN(score)) return null;
  if (!policy || !policy.criteria || !policy.criteria.length) return null;
  for (const c of policy.criteria) {
    if (score >= c.min_score) return c.grade_code;
  }
  return null;  // 어느 cutoff에도 해당 안 되면 null
}
```

#### 2-3. buildGradeMap 교체 (server/index.js line 2123~2138)

```javascript
/**
 * 활성 정책 기반 등급 맵 생성.
 * @param {number} policyId
 * @returns {Object} { gradeCodes, maxScore: 100, scoreToGrade: (score) => string|null }
 */
function buildGradeMap(policyId) {
  if (!policyId) return null;
  const criteria = db.prepare(`
    SELECT grade_code, grade_name, min_score, sort_order
    FROM grade_policy_criteria
    WHERE policy_id = ?
    ORDER BY min_score DESC
  `).all(policyId);
  if (!criteria.length) return null;
  const policy = { id: policyId, criteria };
  const gradeCodes = criteria.map(c => c.grade_code);
  return {
    gradeCodes,
    maxScore: 100,
    scoreToGrade: (score) => scoreToGrade(score, policy)
    // codeToScore 폐기 (사용처 0곳, 옵션 A)
  };
}
```

**codeToScore 완전 제거** — buildGradeMap 반환에서 빼고, 정의(line 2128~2129)도 삭제.

#### 2-4. calcGradeStats 변경 (line 2162 부근)

기존: `const { gradeCodes, codeToScore, maxScore, scoreToGrade } = gm;`
변경: `const { gradeCodes, maxScore, scoreToGrade } = gm;` (codeToScore 제거)

`buildGradeMap()` 호출 시 인자가 필요해짐 — 호출처(line 2232, 2297, 2346, 2426)에서 적절한 policyId 전달. 일반적으로 각 평가의 정책을 lookup해야 함.

**계산 시점이 평가별로 다르므로 calcGradeStats 흐름 재검토 필요**:
- 사전 점검에서 calcGradeStats 호출 컨텍스트(어떤 평가들에 대한 통계인지) 확인
- 만약 여러 평가가 다른 정책일 수 있다면, 평가별로 정책 lookup 후 등급 산출
- 단순화 가능 시: 활성 평가 기간이 1개라면 그 기간의 정책 1개로 일괄 처리

**판단 기준** (사전 점검에서 확정):
- 호출처 line ± 30줄을 view_range로 읽고 입력 evals의 구조 확인
- 모두 같은 period_id면 buildGradeMap(period.grade_policy_id) 1회 호출
- 섞여 있으면 evalId마다 getPolicyForEval(evalId) → scoreToGrade(score, policy)

채팅에 호출처별 정책 처리 방침 보고 후 진행.

#### 2-5. server/index.js:1171 — S/A/B/C/D 하드코딩 제거 (핵심)

기존:
```javascript
const grade = finalScore >= 90 ? 'S' : finalScore >= 80 ? 'A'
            : finalScore >= 70 ? 'B' : finalScore >= 60 ? 'C' : 'D';
```

변경:
```javascript
const policy = getPolicyForEval(evalId);
const grade = scoreToGrade(finalScore, policy);
if (!grade) {
  // 정책 매칭 실패 — 평가 기간에 정책이 바인딩되지 않았거나 score가 cutoff 밖
  return res.status(400).json({
    error: '등급 산출 실패: 평가 기간에 등급 정책이 바인딩되지 않았거나 점수가 정책 범위 밖입니다.'
  });
}
```

이렇게 변경하면 정책 미바인딩 기간의 평가 제출 자체가 차단됨 — 활성화 게이트(아래 §4)와 함께 가드 작동.

#### 2-6. server/index.js:1148 (2차 평가 제출) 처리

기존: `selected_grade || fe.selected_grade`
이 부분은 grade_code 자체를 다루므로 정책 변경의 영향이 적음. 단, `selected_grade`로 전달받는 grade_code가 활성 정책의 grade_code 목록에 있는지 검증 추가 권장:

```javascript
if (selected_grade) {
  const policy = getPolicyForEval(evalId);
  const validCodes = policy ? policy.criteria.map(c => c.grade_code) : [];
  if (!validCodes.includes(selected_grade)) {
    return res.status(400).json({
      error: `유효하지 않은 등급 코드: ${selected_grade}. 정책: ${policy?.name || '없음'}`
    });
  }
}
```

#### 2-7. seed-eval-data.js scoreToGrade (line 479~484) 통일

기존 s1n 공식 제거, 정책 기반 단일 함수로 교체:

```javascript
// 디폴트 정책의 criteria를 인자로 받음 (loadGrades에서 호출 시 전달)
function scoreToGrade(score, criteria) {
  if (score == null || isNaN(score)) return null;
  for (const c of criteria) {  // criteria는 min_score DESC 정렬 전제
    if (score >= c.min_score) return c.grade_code;
  }
  return null;
}
```

호출처(line 443)에서 criteria를 한 번 로딩해서 재사용:
```javascript
const defaultCriteria = db.prepare(`
  SELECT grade_code, min_score FROM grade_policy_criteria
  WHERE policy_id = (SELECT id FROM grade_policies WHERE name = '사이냅 표준안')
  ORDER BY min_score DESC
`).all();
// 이후 scoreToGrade(finalScore, defaultCriteria) 호출
```

`loadGrades` 함수도 grade_criteria → grade_policy_criteria 참조로 변경.

#### 2-8. recalc-final-scores.js (line 61~67, 77) 통일

기존 하드코딩 cutoff 제거, 정책 기반 동일 함수:

```javascript
function scoreToGrade(score, criteria) {
  if (score == null || isNaN(score)) return null;
  for (const c of criteria) {
    if (score >= c.min_score) return c.grade_code;
  }
  return null;
}
```

호출 시 평가별로 정책 lookup. 또는 단순화로 디폴트 정책 사용 (재계산 스크립트의 용도가 일회성 마이그레이션이라면).

### 3. 시드 스크립트 보강

`scripts/seed-eval-data.js`에 다음 추가 (eval_periods 시드 직후, evals 시드 직전):

```javascript
// === 등급 정책 시드 ===
console.log('Seeding default grade policy: 사이냅 표준안');

// 디폴트 정책 생성 (있으면 skip)
let defaultPolicy = db.prepare('SELECT id FROM grade_policies WHERE name = ?')
                      .get('사이냅 표준안');
if (!defaultPolicy) {
  const result = db.prepare(`
    INSERT INTO grade_policies (name, description, created_by)
    VALUES (?, ?, ?)
  `).run(
    '사이냅 표준안',
    '운영 디폴트 등급 정책 (OI=90/EE=80/SC=70/ME=60/PB=50/IR=40)',
    1  // master 사용자
  );
  defaultPolicy = { id: result.lastInsertRowid };
}

// 디폴트 정책의 cutoff 시드
const defaultCriteria = [
  { code: 'OI', name: 'OI (Outstanding Impact)',   min: 90, order: 1 },
  { code: 'EE', name: 'EE (Exceeds Expectations)', min: 80, order: 2 },
  { code: 'SC', name: 'SC (Strong Contributor)',   min: 70, order: 3 },
  { code: 'ME', name: 'ME (Meets Expectations)',   min: 60, order: 4 },
  { code: 'PB', name: 'PB (Performance Building)', min: 50, order: 5 },
  { code: 'IR', name: 'IR (Improvement Required)', min: 40, order: 6 },
];

for (const c of defaultCriteria) {
  db.prepare(`
    INSERT OR IGNORE INTO grade_policy_criteria
      (policy_id, grade_code, grade_name, min_score, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(defaultPolicy.id, c.code, c.name, c.min, c.order);
}

// 모든 기존 eval_periods에 디폴트 정책 자동 바인딩 (개발 편의)
const updated = db.prepare(`
  UPDATE eval_periods SET grade_policy_id = ? WHERE grade_policy_id IS NULL
`).run(defaultPolicy.id);
console.log(`  Default policy bound to ${updated.changes} existing eval_periods`);
```

기존 `grade_criteria` 시드 코드(server/index.js line 3015~3022, 또는 seed-eval-data.js 동일 위치)는 **완전 제거**.

### 4. 라우터 변경

#### 4-1. /api/grade-criteria CRUD 4개 라우터 제거

사전 점검 grep으로 line 확정 후, 4개 라우터(GET/POST/PUT/DELETE) 완전 제거. 관리자 UI(63C)에서 호출처도 제거 예정이지만, 본 PROMPT에서는 API만 제거하고 UI는 일단 호출 오류 발생 상태로 둠 (63C에서 해소).

→ **63A에서 API 제거 시 63C 완료 전까지 관리자 등급 관리 탭이 깨질 수 있음**. 63B → 63C 순서를 빠르게 진행해야 함.

대안: API는 410 Gone 응답으로 임시 반환 (관리자 UI가 깨지지 않고 메시지 표시 가능). 권장.

```javascript
app.all('/api/grade-criteria', (req, res) => {
  res.status(410).json({
    error: 'grade_criteria API는 폐기되었습니다. /api/grade-policies를 사용하세요.'
  });
});
app.all('/api/grade-criteria/:id', (req, res) => {
  res.status(410).json({
    error: 'grade_criteria API는 폐기되었습니다.'
  });
});
```

#### 4-2. /api/eval-periods 활성화 게이트 + 생성 시 정책 필수

`POST /api/eval-periods` (사전 점검 grep 확정 line):
```javascript
const { eval_year, period_label, period_type, grade_policy_id, /* ... */ } = req.body;

if (!grade_policy_id) {
  return res.status(400).json({
    error: '등급의 100점환산 기준이 저장되지 않았습니다. 적용해 주세요.'
  });
}

// 정책 존재 검증
const policy = db.prepare('SELECT id FROM grade_policies WHERE id = ?').get(grade_policy_id);
if (!policy) {
  return res.status(400).json({ error: '유효하지 않은 grade_policy_id' });
}

// INSERT 시 grade_policy_id 포함
db.prepare(`
  INSERT INTO eval_periods (eval_year, period_label, period_type, grade_policy_id, ...)
  VALUES (?, ?, ?, ?, ...)
`).run(eval_year, period_label, period_type, grade_policy_id, /* ... */);
```

`PATCH /api/eval-periods/:id/toggle` (사전 점검 grep 확정 line):
```javascript
const target = db.prepare('SELECT is_active, grade_policy_id FROM eval_periods WHERE id = ?')
                 .get(req.params.id);
if (!target) return res.status(404).json({ error: 'Period not found' });

const willActivate = !target.is_active;
if (willActivate && !target.grade_policy_id) {
  return res.status(400).json({
    error: '등급의 100점환산 기준이 저장되지 않았습니다. 적용해 주세요.'
  });
}

// 기존 토글 로직
db.prepare('UPDATE eval_periods SET is_active = ? WHERE id = ?')
  .run(willActivate ? 1 : 0, req.params.id);
```

`GET /api/eval-periods` 응답에 `grade_policy_id` + 정책 이름(JOIN) 포함:
```javascript
SELECT ep.*, gp.name AS grade_policy_name
FROM eval_periods ep
LEFT JOIN grade_policies gp ON gp.id = ep.grade_policy_id
WHERE ...
```

### 5. grade_policies CRUD 라우터 신규

PROMPT 63B에서 별도 처리하지만, **본 PROMPT에서 최소 GET만 구현** (eval_periods 생성 폼이 정책 목록을 받아와야 하기 때문). 63B에서 POST/PUT/DELETE + 검증 로직 추가.

```javascript
// GET /api/grade-policies — 정책 목록 + criteria 포함 (admin+)
app.get('/api/grade-policies', requireRole(['master','admin']), (req, res) => {
  const policies = db.prepare(`
    SELECT id, name, description, created_at, created_by FROM grade_policies ORDER BY id
  `).all();
  for (const p of policies) {
    p.criteria = db.prepare(`
      SELECT id, grade_code, grade_name, min_score, sort_order, description, note
      FROM grade_policy_criteria
      WHERE policy_id = ?
      ORDER BY sort_order
    `).all(p.id);
    // 이 정책을 적용 중인 기간 목록 (정책 상세 UI 용)
    p.applied_periods = db.prepare(`
      SELECT id, eval_year, period_label, is_active FROM eval_periods
      WHERE grade_policy_id = ?
      ORDER BY eval_year DESC, id DESC
    `).all(p.id);
  }
  res.json(policies);
});
```

POST/PUT/DELETE는 63B에서.

---

## 작업 절차

### 1. 사전 점검 grep (4회)

위 4개 grep 명령 실행. 결과를 채팅에 한 줄씩 보고:
- "/api/grade-criteria 라우터: server/index.js line N (4개)"
- "/api/eval-periods POST: line N, PATCH toggle: line N"
- "eval_periods CREATE TABLE: line N"
- "loadGrades: scripts/seed-eval-data.js line N, server 참조 없음/있음"

미확정 사항 있으면 추가 grep 최대 2회 허용.

### 2. DB 마이그레이션 작성

`scripts/migrate-grade-policy.js` 신규 작성 (1회용 마이그레이션):

```javascript
// scripts/migrate-grade-policy.js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/hrmanage.db');
const db = new Database(dbPath);

console.log('Starting grade policy migration...');

db.exec('BEGIN');
try {
  // 1. grade_policies 신규
  db.exec(`
    CREATE TABLE IF NOT EXISTS grade_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id)
    )
  `);

  // 2. grade_policy_criteria 신규
  db.exec(`
    CREATE TABLE IF NOT EXISTS grade_policy_criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id INTEGER NOT NULL REFERENCES grade_policies(id) ON DELETE CASCADE,
      grade_code TEXT NOT NULL,
      grade_name TEXT NOT NULL,
      min_score REAL NOT NULL CHECK (min_score >= 0 AND min_score <= 100),
      sort_order INTEGER NOT NULL,
      description TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(policy_id, grade_code),
      UNIQUE(policy_id, sort_order)
    )
  `);

  // 3. eval_periods.grade_policy_id 추가 (이미 있으면 skip)
  const cols = db.prepare("PRAGMA table_info(eval_periods)").all();
  if (!cols.find(c => c.name === 'grade_policy_id')) {
    db.exec(`ALTER TABLE eval_periods ADD COLUMN grade_policy_id INTEGER REFERENCES grade_policies(id)`);
    console.log('  Added eval_periods.grade_policy_id');
  } else {
    console.log('  eval_periods.grade_policy_id already exists');
  }

  // 4. grade_criteria DROP (있으면)
  db.exec(`DROP TABLE IF EXISTS grade_criteria`);
  console.log('  Dropped grade_criteria table');

  db.exec('COMMIT');
  console.log('Migration completed successfully.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Migration failed:', e);
  process.exit(1);
}
```

**마이그레이션 실행은 사용자 명시 승인 후**. PROMPT 63A 실행 자체로 즉시 실행하지 않음 — 작업 완료 시점에 사용자에게 마이그레이션 실행 명령 안내.

### 3. server/index.js 변경

순서:
1. CREATE TABLE grade_criteria 코드 제거 (line 2931~2940)
2. grade_criteria 시드 INSERT 제거 (line 3015~3022)
3. CREATE TABLE grade_policies / grade_policy_criteria 추가
4. ALTER TABLE eval_periods (서버 부팅 시 컬럼 없으면 추가하는 마이그레이션 로직)
5. buildGradeMap 교체 (line 2123~2138)
6. codeToScore 제거 (line 2128~2129)
7. calcGradeStats 호출처 4곳 정합 (line 2232, 2297, 2346, 2426 + 호출처 입력 evals 정책 처리)
8. getPolicyForEval, scoreToGrade 신규 헬퍼 추가
9. server/index.js:1171 (S/A/B/C/D 하드코딩) 제거 → 정책 기반 산출
10. server/index.js:1148 selected_grade 검증 추가
11. /api/grade-criteria 4개 라우터 → 410 Gone 응답으로 교체
12. /api/eval-periods POST에 grade_policy_id 필수화
13. /api/eval-periods PATCH toggle에 활성화 게이트 추가
14. /api/eval-periods GET 응답에 grade_policy_id + 정책 이름 JOIN
15. /api/grade-policies GET 신규 (POST/PUT/DELETE는 63B에서)

### 4. prisma/schema.prisma 변경

- model GradeCriteria 제거 (line 285~294)
- model GradePolicy, GradePolicyCriteria 추가
- model EvalPeriod에 gradePolicyId 필드 추가
- model User에 createdGradePolicies 역참조 추가
- `npx prisma generate` 실행 (Prisma Client 재생성)

### 5. 시드 스크립트 변경

- scripts/seed-eval-data.js의 grade_criteria 입력 제거
- 디폴트 정책 + criteria + 기존 eval_periods 자동 바인딩 시드 추가 (위 §3)
- scoreToGrade 함수 정책 기반으로 교체 (line 479~484)
- 호출부(line 443) criteria 전달
- loadGrades 함수 grade_policy_criteria 참조로 변경

### 6. recalc 스크립트 변경

scripts/recalc-final-scores.js의 scoreToGrade 함수 정책 기반으로 교체 (line 61~67).

### 7. 검증 시나리오 실행

#### 시나리오 1: DB 마이그레이션
- `node scripts/migrate-grade-policy.js` 실행
- ✅ grade_policies, grade_policy_criteria 테이블 생성됨
- ✅ eval_periods에 grade_policy_id 컬럼 추가됨
- ✅ grade_criteria 테이블 DROP됨
- 재실행 시 idempotent (다시 실행해도 오류 없음)

#### 시나리오 2: 시드 재실행
- `node scripts/seed-eval-data.js` 실행
- ✅ "사이냅 표준안" 정책 생성
- ✅ 6개 criteria (OI/EE/SC/ME/PB/IR) cutoff 시드 입력
- ✅ 기존 eval_periods 모두 grade_policy_id에 디폴트 정책 ID 바인딩됨
- ✅ "Default policy bound to N existing eval_periods" 메시지

#### 시나리오 3: 평가 기간 활성화 게이트
- master 로그인 → 평가 기간 관리
- 신규 기간 생성 시 grade_policy_id 미전송 → 400 에러 "등급의 100점환산 기준이 저장되지 않았습니다. 적용해 주세요."
- 기존 비활성 기간의 grade_policy_id를 NULL로 임시 SQL 변경 → 활성화 토글 시도 → 400 에러 동일 메시지
- grade_policy_id 유효값 전송 → 정상 생성/활성화

#### 시나리오 4: 등급 산출 로직 통일
- 임의 사용자의 평가 사이클에서 자기평가 → 상사평가 → 최종 제출
- 콘솔에 final_score, final_grade 확인
- ✅ final_grade가 OI/EE/SC/ME/PB/IR 중 하나 (S/A/B/C/D 절대 안 나옴)
- ✅ final_score=85 → grade=EE (cutoff 80~89)
- ✅ final_score=72 → grade=SC (cutoff 70~79)
- ✅ final_score=39 → grade=null (40 미만, IR cutoff 미달)

#### 시나리오 5: PROMPT 62 회귀
- 조직 평균 표시(89.19점 등) 그대로 유지 — 변경 없음
- 등급 분포 차트 정상 표시 (gm.gradeCodes가 정책 정보로 반환됨)

#### 시나리오 6: codeToScore 폐기 확인
- `findstr /s /n "codeToScore" server\ scripts\ public\`
- ✅ 결과 0건

#### 시나리오 7: server/index.js:1171 S/A/B/C/D 제거 확인
- `findstr /n "'S':.*'A':\|>=.*?.S\|>= 90.*'S'" server\index.js`
- ✅ 결과 0건

#### 시나리오 8: grade_criteria 폐기 확인
- `findstr /s /n "grade_criteria" server\ scripts\ prisma\`
- ✅ 결과: 마이그레이션 스크립트의 DROP TABLE 외 0건 (또는 410 응답 라우터의 안내 문구 정도만)

### 8. 회귀 확인

- 기존 시드 final_evaluations.final_grade 값 그대로 보존 (시드 64건 + α)
- 등급 분포 차트, 조직 평균 산출 정상
- 평가 기간 관리 화면 정상 (단, 등급 정책 드롭다운은 63B/63C에서 추가)
- 관리자 등급 관리 탭은 410 응답으로 임시 깨짐 상태 (63C에서 해소) — 사용자에게 명시 안내

### 9. ClaudeHRM.md 갱신

#### 9-1. 설계 원칙 추가 (24번 뒤 25번 신설)

```
25. **등급 정책 시점별 바인딩** (2026-05-29, PROMPT 63A):
    - 등급 산출 단일 진실: `grade_policy_criteria.min_score` cutoff 참조
    - 평가 기간(`eval_periods`)에 `grade_policy_id` FK 바인딩 — NULL이면 활성화 차단
    - 정책 미바인딩 기간 활성화 시도 시 400 에러: "등급의 100점환산 기준이 저장되지 않았습니다. 적용해 주세요."
    - 디폴트 정책: "사이냅 표준안" (OI=90/EE=80/SC=70/ME=60/PB=50/IR=40)
    - 평가 제출 시점에 `eval.period_id → eval_periods.grade_policy_id → grade_policy_criteria` lookup
    - 정책 변경은 그 시점 이후 신규 평가에만 영향, 기존 `final_grade` 보존
    - 폐기: 기존 `grade_criteria` 테이블, `codeToScore` 헬퍼, server/index.js의 S/A/B/C/D 하드코딩
```

#### 9-2. API 엔드포인트 갱신

```
DELETE /api/grade-criteria (폐기, 410 Gone)
GET    /api/grade-policies          등급 정책 목록 + criteria + applied_periods (admin+)
# POST/PUT/DELETE는 PROMPT 63B에서 추가

POST   /api/eval-periods            기간 추가 — grade_policy_id 필수 (admin+)
PATCH  /api/eval-periods/:id/toggle 활성/비활성 토글 — 활성화 시 grade_policy_id 필수 (admin+)
```

#### 9-3. ERD 갱신

`grade_criteria` 제거, `grade_policies` + `grade_policy_criteria` 추가, `eval_periods.grade_policy_id` 표기.

#### 9-4. 개발 이력 1줄 추가 (최상단)

```
| 2026-05-29 | 등급 정책 시점별 바인딩 도입 — grade_policies/grade_policy_criteria 신규, eval_periods 게이트, scoreToGrade 통일, S/A/B/C/D 하드코딩 제거 (PROMPT 63A) | Claude Code |
```

### 10. Git 커밋 (푸시 보류)

```bash
git add server/ scripts/ prisma/ ClaudeHRM.md
git commit -m "등급 정책 시점별 바인딩 도입 (DB+라우터+시드+산출 통일) (PROMPT 63A)"
# git push 금지 — 검증 통과 + 사용자 명시 승인 후
```

### 11. 사용자에게 보고

- 시나리오 1~8 통과 결과 보고
- 마이그레이션 실행 명령 안내: `node scripts/migrate-grade-policy.js`
- 시드 재실행 안내 (개발 DB만): `node scripts/seed-eval-data.js`
- 관리자 등급 관리 탭 임시 깨짐 안내 (63C 후 해소)
- "PROMPT 63A 완료, PROMPT 63B 진행 가능" 보고

---

## 작업 완료 체크리스트

- [ ] 사전 점검 grep 4회 + 미확정 사항 보고
- [ ] 마이그레이션 스크립트 작성 (scripts/migrate-grade-policy.js)
- [ ] server/index.js: CREATE TABLE 변경, buildGradeMap·codeToScore·scoreToGrade·:1171 교체
- [ ] server/index.js: getPolicyForEval / scoreToGrade 헬퍼 추가
- [ ] server/index.js: /api/grade-criteria 4개 → 410 Gone
- [ ] server/index.js: /api/eval-periods POST에 grade_policy_id 필수화
- [ ] server/index.js: /api/eval-periods PATCH toggle 활성화 게이트
- [ ] server/index.js: /api/eval-periods GET 응답 JOIN
- [ ] server/index.js: /api/grade-policies GET 신규
- [ ] prisma/schema.prisma 동기화 + `npx prisma generate`
- [ ] scripts/seed-eval-data.js: grade_criteria 입력 제거, 디폴트 정책 시드 + 자동 바인딩 추가
- [ ] scripts/seed-eval-data.js: scoreToGrade 정책 기반 교체
- [ ] scripts/recalc-final-scores.js: scoreToGrade 정책 기반 교체
- [ ] 시나리오 1~8 통과
- [ ] 회귀 확인 (PROMPT 62 조직 평균, 등급 분포 차트, 기존 final_grade 보존)
- [ ] ClaudeHRM.md 갱신 (설계 원칙 25번 신설, API 엔드포인트, ERD, 개발 이력)
- [ ] git commit (푸시 보류)
- [ ] 사용자 보고 + 마이그레이션·시드 실행 명령 안내

---

## 주의사항

### DB 마이그레이션 안전성
- 마이그레이션 스크립트는 트랜잭션으로 감싸기 (BEGIN/COMMIT/ROLLBACK)
- 재실행 가능(idempotent) — CREATE TABLE IF NOT EXISTS, ALTER TABLE은 컬럼 존재 체크 후 추가, DROP은 IF EXISTS
- 실패 시 ROLLBACK + 명확한 에러 로그
- 마이그레이션 직전 자동 백업: `cp data/hrmanage.db data/backups/hrmanage_before_63A_$(date +%Y%m%d_%H%M%S).db`
- **마이그레이션 실행은 사용자 명시 승인 후** — Claude Code가 자동 실행 금지

### 운영 데이터 영향
- **기존 final_evaluations.final_grade 절대 건드리지 않음** — 사용자 명시 결정
- 시드 데이터의 OI/EE/SC, 운영 데이터의 S/A/B/C/D 모두 보존
- 신규 평가만 새 정책 산출 — 운영 출시 시점에 정상 흐름 적용

### 관리자 UI 임시 깨짐
- /api/grade-criteria가 410 응답으로 바뀌면 기존 "등급 관리" 탭 동작 불가
- 63B(라우터 완성) + 63C(UI 신규) 진행 전까지 관리자에게 안내 필요
- 사용자에게 보고 시 명확히 명시: "PROMPT 63A 완료 후 등급 관리 탭이 임시 깨짐, 63B/63C 완료 후 정상화"

### 코드 읽기 가이드 — 압축 방지
- server/index.js, prisma/schema.prisma, scripts 모두 전체 view 금지
- 사전 점검 grep 결과 line ± 30줄만 view_range
- 작업 중 함수 정의를 다시 봐야 할 때도 view_range 사용

### 푸시 정책
- 자동 푸시 ❌ (DB 스키마 변경)
- 검증 통과 + 사용자 명시 승인 후 수동 푸시
- 마이그레이션 실행도 별도 승인

### PROMPT 62 회귀 방지
- 조직 평균 산출(final_score 직접 평균)은 본 작업 영향 범위 밖 — 변경 금지
- 등급 분포 차트의 gm 호출 시 정책 lookup만 추가, 표시 로직은 불변
- 회귀 발견 시 즉시 보고

---

## 다음 단계

PROMPT 63A 완료 후:
- **PROMPT 63B**: grade_policies POST/PUT/DELETE 라우터 + 검증 로직 (단조감소, 0~100, 중복 불가) + audit_log
- **PROMPT 63C**: 관리자 UI (등급 정책 관리 탭 신규, 평가 기간 폼 정책 드롭다운, 미바인딩 알림 배너 상단 고정, 기존 등급 관리 탭 제거)

---

## 본 PROMPT 작성 시 적용된 원칙
- CLAUDE.md "PROMPT 작성 원칙" 3종 모두 적용
- PROMPT 63-PRE 분석 결과 line 번호 그대로 인용 (재탐색 금지)
- 단계 분리 (63A 데이터 + 산출 통일, 63B 라우터 보강, 63C UI) — Claude Code 컨텍스트 부담 분산
- DB 마이그레이션은 별도 스크립트 + 사용자 명시 승인
- 자동 푸시 금지 (DB 스키마 변경, 회색 지대)
- 기존 운영 데이터 보존 원칙 (사용자 명시 결정)
