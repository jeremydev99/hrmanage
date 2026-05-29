# CLAUDE_CODE_PROMPT_63B — 등급 정책 CRUD API (POST/PUT/DELETE + 검증 + 수정 잠금 + audit_log)

## 실행 트리거

사용자가 "PROMPT 63B 진행해줘" 발언 시 본 PROMPT 시작.
완료 후 "PROMPT 63B 완료" 보고 + PROMPT 63C(관리자 UI) 진행 가능 안내.

---

## 작업 개요

PROMPT 63A에서 데이터 모델 + 산출 로직 통일 + GET 라우터를 완성. 본 PROMPT는 **3단계 분리 중 2단계** — 정책 관리 라우터의 쓰기 작업(생성·수정·삭제)을 완성하고 검증·잠금·audit_log를 추가.

**63A에서 미완성**:
- `POST /api/grade-policies` — 신규 정책 생성
- `PUT /api/grade-policies/:id` — 정책 수정 (이름·description + criteria 분기 처리)
- `DELETE /api/grade-policies/:id` — 정책 삭제 (applied_periods NULL 강제 초기화)
- 검증 헬퍼 (`validateGradePolicyCriteria`)
- audit_log 통합

**핵심 설계 결정 (사용자 확정, 2026-05-29)**:

1. **단일 라우터 + 내부 구별 (옵션 2)**: `PUT /api/grade-policies/:id`에서 criteria 포함 여부로 분기
   - name·description만 보내면 applied_periods 있어도 수정 허용
   - criteria 배열을 보내면 applied_periods 있을 때 거부 (cutoff 잠금)

2. **검증 완전 (단조감소 + 0~100 + 중복 불가)**:
   - 각 criteria의 min_score는 0~100 범위
   - sort_order 순서대로 정렬 시 min_score는 단조감소 (sort_order 1이 가장 높은 cutoff)
   - 정책 내 grade_code 중복 불가
   - 정책 내 min_score 중복 불가 (동일 점수가 두 등급으로 매핑되면 안 됨)
   - criteria 최소 1건 이상

3. **삭제 정책**: applied_periods 있어도 삭제 허용 — 해당 기간의 grade_policy_id NULL로 강제 초기화 + 비활성화 + audit_log

4. **audit_log 액션**:
   - `GRADE_POLICY_CREATED` — 정책 신규 생성
   - `GRADE_POLICY_UPDATED` — 이름·description 수정
   - `GRADE_POLICY_CRITERIA_UPDATED` — cutoff 수정 (applied_periods 없을 때만 가능)
   - `GRADE_POLICY_DELETED` — 정책 삭제 (영향 기간 ID 목록 포함)
   - `EVAL_PERIOD_POLICY_DETACHED` — 정책 삭제로 인한 기간의 grade_policy_id NULL 강제

## 작업 위험도: 중 (운영 데이터 영향 없음, 라우터·검증 로직 추가)
## 자동 푸시 여부: ⚠️ 사용자 명시 승인 후 (DB 마이그레이션 없음이나 정책 관리 동작 영향)

---

## 코드 읽기 가이드 (압축 방지)

PROMPT 63A 완료 후 상태 기준. 본 작업은 다음 영역만 좁게 읽고 진행:

### 사전 점검 grep (3회 이내)

```bash
# 1) 63A에서 만든 GET /api/grade-policies 라우터 위치 확인
findstr /n "/api/grade-policies" server\index.js

# 2) audit_log 사용 패턴 — 기존 작성 방식 확인 (NULL 권한·메타 데이터 형식)
findstr /n "audit_log\|writeAudit\|INSERT INTO audit_log" server\index.js

# 3) requireRole 미들웨어 사용 위치 (admin 권한 체크)
findstr /n "requireRole" server\index.js
```

미확정 사항 있으면 추가 grep 최대 2회 허용.

### 확정 후 읽을 영역 (좁게)

- `server/index.js`: GET /api/grade-policies 위치 (확정 line ± 30줄)
- `server/index.js`: 기존 audit_log 작성 패턴 1~2건 (확정 line ± 10줄)
- `server/index.js`: requireRole 사용 1~2건 (확정 line ± 5줄)
- `server/index.js`: PROMPT 63A에서 추가된 buildGradeMap·scoreToGrade·getPolicyForEval 위치 (이미 ClaudeHRM에 기록)

**그 외 view 금지**. 전체 파일 view 금지, view_range 필수.

---

## 변경 사양

### 1. 검증 헬퍼 `validateGradePolicyCriteria(criteria)` 신규 추가

`buildGradeMap`/`scoreToGrade` 헬퍼 근처에 추가:

```javascript
/**
 * 등급 정책 cutoff 배열 검증.
 * @param {Array} criteria [{grade_code, grade_name, min_score, sort_order}, ...]
 * @returns {Object} { ok: boolean, error?: string }
 */
function validateGradePolicyCriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { ok: false, error: '최소 1개 이상의 등급이 필요합니다.' };
  }

  // 1. 각 행 필수 필드 + 범위 검증
  for (const c of criteria) {
    if (!c.grade_code || typeof c.grade_code !== 'string' || !c.grade_code.trim()) {
      return { ok: false, error: 'grade_code는 필수입니다.' };
    }
    if (!c.grade_name || typeof c.grade_name !== 'string' || !c.grade_name.trim()) {
      return { ok: false, error: 'grade_name은 필수입니다.' };
    }
    if (typeof c.min_score !== 'number' || isNaN(c.min_score)) {
      return { ok: false, error: `min_score는 숫자여야 합니다. (${c.grade_code})` };
    }
    if (c.min_score < 0 || c.min_score > 100) {
      return { ok: false, error: `min_score는 0~100 범위여야 합니다. (${c.grade_code}=${c.min_score})` };
    }
    if (!Number.isInteger(c.sort_order) || c.sort_order < 1) {
      return { ok: false, error: `sort_order는 1 이상 정수여야 합니다. (${c.grade_code})` };
    }
  }

  // 2. grade_code 중복 검증
  const codes = criteria.map(c => c.grade_code);
  const codeSet = new Set(codes);
  if (codeSet.size !== codes.length) {
    return { ok: false, error: 'grade_code는 중복될 수 없습니다.' };
  }

  // 3. sort_order 중복 검증
  const orders = criteria.map(c => c.sort_order);
  const orderSet = new Set(orders);
  if (orderSet.size !== orders.length) {
    return { ok: false, error: 'sort_order는 중복될 수 없습니다.' };
  }

  // 4. min_score 중복 검증 (동일 점수가 두 등급으로 매핑되면 안 됨)
  const scores = criteria.map(c => c.min_score);
  const scoreSet = new Set(scores);
  if (scoreSet.size !== scores.length) {
    return { ok: false, error: 'min_score는 중복될 수 없습니다. (동일 점수가 두 등급으로 매핑 불가)' };
  }

  // 5. 단조감소 검증 (sort_order 오름차순 → min_score 내림차순)
  const sorted = [...criteria].sort((a, b) => a.sort_order - b.sort_order);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].min_score <= sorted[i + 1].min_score) {
      return {
        ok: false,
        error: `sort_order 순서로 min_score가 단조감소해야 합니다. (${sorted[i].grade_code}=${sorted[i].min_score} <= ${sorted[i + 1].grade_code}=${sorted[i + 1].min_score})`
      };
    }
  }

  return { ok: true };
}
```

### 2. POST /api/grade-policies — 신규 정책 생성

```javascript
app.post('/api/grade-policies', requireRole(['master', 'admin']), (req, res) => {
  const { name, description, criteria } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: '정책 이름은 필수입니다.' });
  }

  // 이름 중복 체크
  const existing = db.prepare('SELECT id FROM grade_policies WHERE name = ?').get(name.trim());
  if (existing) {
    return res.status(409).json({ error: `이미 존재하는 정책 이름입니다: ${name}` });
  }

  // criteria 검증
  const validation = validateGradePolicyCriteria(criteria);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO grade_policies (name, description, created_by)
      VALUES (?, ?, ?)
    `).run(name.trim(), description || null, req.user.id);

    const policyId = result.lastInsertRowid;

    const insertCriteria = db.prepare(`
      INSERT INTO grade_policy_criteria
        (policy_id, grade_code, grade_name, min_score, sort_order, description, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of criteria) {
      insertCriteria.run(
        policyId, c.grade_code.trim(), c.grade_name.trim(),
        c.min_score, c.sort_order,
        c.description || null, c.note || null
      );
    }

    return policyId;
  });

  try {
    const policyId = tx();

    // audit_log
    writeAudit(req.user.id, 'GRADE_POLICY_CREATED', {
      policy_id: policyId,
      name: name.trim(),
      criteria_count: criteria.length,
      criteria: criteria.map(c => ({ code: c.grade_code, min_score: c.min_score }))
    });

    res.status(201).json({ id: policyId, name: name.trim() });
  } catch (e) {
    res.status(500).json({ error: '정책 생성 실패: ' + e.message });
  }
});
```

### 3. PUT /api/grade-policies/:id — 정책 수정 (단일 라우터 + 내부 구별)

**핵심 분기 로직** (사용자 확정 옵션 2):
- name 또는 description만 보낸 경우 → applied_periods 무관, 수정 허용
- criteria 배열을 보낸 경우 → applied_periods 0건일 때만 수정 허용 (cutoff 잠금)
- 둘 다 보낸 경우 → 각각 위 규칙 적용 (이름은 항상 가능, criteria는 잠금 체크)

```javascript
app.put('/api/grade-policies/:id', requireRole(['master', 'admin']), (req, res) => {
  const policyId = parseInt(req.params.id);
  if (!Number.isInteger(policyId)) {
    return res.status(400).json({ error: '유효하지 않은 정책 ID' });
  }

  const target = db.prepare('SELECT id, name, description FROM grade_policies WHERE id = ?').get(policyId);
  if (!target) {
    return res.status(404).json({ error: '정책을 찾을 수 없습니다.' });
  }

  const { name, description, criteria } = req.body;
  const hasNameOrDesc = (name !== undefined) || (description !== undefined);
  const hasCriteria = criteria !== undefined;

  if (!hasNameOrDesc && !hasCriteria) {
    return res.status(400).json({ error: '수정할 필드가 없습니다.' });
  }

  // criteria 수정 시점에 applied_periods 잠금 체크
  if (hasCriteria) {
    const appliedCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM eval_periods WHERE grade_policy_id = ?
    `).get(policyId).cnt;

    if (appliedCount > 0) {
      const appliedPeriods = db.prepare(`
        SELECT id, eval_year, period_label FROM eval_periods
        WHERE grade_policy_id = ?
        ORDER BY eval_year DESC, id DESC
      `).all(policyId);

      return res.status(409).json({
        error: `이 정책은 ${appliedCount}개 평가 기간에 적용 중이므로 cutoff(등급 기준)를 수정할 수 없습니다. 신규 정책을 만들고 새 기간에 바인딩하세요.`,
        applied_periods: appliedPeriods,
        hint: '정책 이름·description은 수정 가능합니다.'
      });
    }

    // criteria 검증
    const validation = validateGradePolicyCriteria(criteria);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
  }

  // 이름 중복 체크 (자기 자신 제외)
  if (name !== undefined && name.trim() !== target.name) {
    const dup = db.prepare('SELECT id FROM grade_policies WHERE name = ? AND id != ?')
                  .get(name.trim(), policyId);
    if (dup) {
      return res.status(409).json({ error: `이미 존재하는 정책 이름입니다: ${name}` });
    }
  }

  const tx = db.transaction(() => {
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description || null);
    }

    if (updates.length > 0) {
      params.push(policyId);
      db.prepare(`UPDATE grade_policies SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    if (hasCriteria) {
      // criteria 전체 교체 (DELETE + INSERT)
      db.prepare('DELETE FROM grade_policy_criteria WHERE policy_id = ?').run(policyId);
      const insert = db.prepare(`
        INSERT INTO grade_policy_criteria
          (policy_id, grade_code, grade_name, min_score, sort_order, description, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of criteria) {
        insert.run(
          policyId, c.grade_code.trim(), c.grade_name.trim(),
          c.min_score, c.sort_order,
          c.description || null, c.note || null
        );
      }
    }
  });

  try {
    tx();

    // audit_log — 변경 내용에 따라 다른 액션
    if (hasNameOrDesc) {
      writeAudit(req.user.id, 'GRADE_POLICY_UPDATED', {
        policy_id: policyId,
        before: { name: target.name, description: target.description },
        after: {
          name: name !== undefined ? name.trim() : target.name,
          description: description !== undefined ? description : target.description
        }
      });
    }
    if (hasCriteria) {
      writeAudit(req.user.id, 'GRADE_POLICY_CRITERIA_UPDATED', {
        policy_id: policyId,
        policy_name: name !== undefined ? name.trim() : target.name,
        new_criteria: criteria.map(c => ({ code: c.grade_code, min_score: c.min_score }))
      });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '정책 수정 실패: ' + e.message });
  }
});
```

### 4. DELETE /api/grade-policies/:id — 정책 삭제 (applied_periods 강제 초기화)

```javascript
app.delete('/api/grade-policies/:id', requireRole(['master', 'admin']), (req, res) => {
  const policyId = parseInt(req.params.id);
  if (!Number.isInteger(policyId)) {
    return res.status(400).json({ error: '유효하지 않은 정책 ID' });
  }

  const target = db.prepare('SELECT id, name FROM grade_policies WHERE id = ?').get(policyId);
  if (!target) {
    return res.status(404).json({ error: '정책을 찾을 수 없습니다.' });
  }

  const appliedPeriods = db.prepare(`
    SELECT id, eval_year, period_label, is_active FROM eval_periods
    WHERE grade_policy_id = ?
  `).all(policyId);

  const tx = db.transaction(() => {
    // applied_periods가 있으면: grade_policy_id NULL로 강제 초기화 + 비활성화
    if (appliedPeriods.length > 0) {
      db.prepare(`
        UPDATE eval_periods
        SET grade_policy_id = NULL, is_active = 0
        WHERE grade_policy_id = ?
      `).run(policyId);
    }

    // 정책 + criteria 삭제 (ON DELETE CASCADE로 criteria 자동 삭제)
    db.prepare('DELETE FROM grade_policies WHERE id = ?').run(policyId);
  });

  try {
    tx();

    // audit_log: 정책 삭제 + 각 기간의 detach 별도 기록
    writeAudit(req.user.id, 'GRADE_POLICY_DELETED', {
      policy_id: policyId,
      policy_name: target.name,
      affected_period_count: appliedPeriods.length,
      affected_periods: appliedPeriods.map(p => ({
        id: p.id,
        label: `${p.eval_year}년 ${p.period_label}`,
        was_active: p.is_active === 1
      }))
    });

    for (const p of appliedPeriods) {
      writeAudit(req.user.id, 'EVAL_PERIOD_POLICY_DETACHED', {
        period_id: p.id,
        period_label: `${p.eval_year}년 ${p.period_label}`,
        reason: `정책 삭제로 인한 강제 초기화 (deleted policy: ${target.name})`,
        was_active: p.is_active === 1,
        deactivated: p.is_active === 1
      });
    }

    res.json({
      ok: true,
      affected_period_count: appliedPeriods.length,
      message: appliedPeriods.length > 0
        ? `정책이 삭제되었습니다. 영향받은 ${appliedPeriods.length}개 평가 기간은 비활성화되었습니다.`
        : '정책이 삭제되었습니다.'
    });
  } catch (e) {
    res.status(500).json({ error: '정책 삭제 실패: ' + e.message });
  }
});
```

### 5. writeAudit 헬퍼 사용

사전 점검에서 확인한 기존 audit_log 작성 패턴을 그대로 따름. 일반적으로 `writeAudit(userId, action, meta)` 형태일 가능성. 없다면 직접 INSERT:

```javascript
db.prepare(`
  INSERT INTO audit_log (user_id, action, meta, created_at)
  VALUES (?, ?, ?, datetime('now'))
`).run(req.user.id, 'GRADE_POLICY_CREATED', JSON.stringify({ ... }));
```

사전 점검 결과에 따라 정확한 함수 시그니처 사용.

---

## 작업 절차

### 1. 사전 점검 grep (3회)

위 grep 3개 실행. 결과 채팅 보고:
- "GET /api/grade-policies 위치: server/index.js line N"
- "audit_log 작성 패턴: writeAudit(userId, action, meta) 헬퍼 / 직접 INSERT — 확정"
- "requireRole 사용 위치 1건 인용"

### 2. 헬퍼 추가

`validateGradePolicyCriteria` 함수를 `buildGradeMap`/`scoreToGrade` 헬퍼 근처에 추가.

### 3. 라우터 3개 추가

GET /api/grade-policies 라우터 바로 아래에 POST/PUT/DELETE 3개 추가. requireRole 미들웨어는 사전 점검 결과 패턴 따름.

### 4. 검증 시나리오 실행

#### 시나리오 1: 정책 신규 생성 (정상)
```
POST /api/grade-policies
{
  "name": "테스트 정책",
  "description": "검증용",
  "criteria": [
    { "grade_code": "A", "grade_name": "최우수", "min_score": 90, "sort_order": 1 },
    { "grade_code": "B", "grade_name": "우수",   "min_score": 70, "sort_order": 2 },
    { "grade_code": "C", "grade_name": "보통",   "min_score": 0,  "sort_order": 3 }
  ]
}
```
- ✅ 201 + { id, name }
- ✅ audit_log: GRADE_POLICY_CREATED 기록

#### 시나리오 2: 검증 실패 케이스 (각각 다른 요청)
- criteria 빈 배열 → 400 "최소 1개 이상의 등급이 필요합니다."
- min_score 100 초과 → 400 "min_score는 0~100 범위여야 합니다."
- min_score 단조감소 위반 (A=80, B=85) → 400 "sort_order 순서로 min_score가 단조감소해야 합니다."
- grade_code 중복 (A 두 개) → 400 "grade_code는 중복될 수 없습니다."
- min_score 중복 (A=80, B=80) → 400 "min_score는 중복될 수 없습니다."
- sort_order 중복 → 400 "sort_order는 중복될 수 없습니다."
- 이름 중복 (사이냅 표준안) → 409 "이미 존재하는 정책 이름입니다"

#### 시나리오 3: 정책 이름·description만 수정 (applied_periods 있어도 허용)
```
PUT /api/grade-policies/1  (사이냅 표준안, applied_periods >= 1)
{ "name": "사이냅 표준안 v1" }
```
- ✅ 200 ok
- ✅ audit_log: GRADE_POLICY_UPDATED with before/after

#### 시나리오 4: 정책 criteria 수정 — 잠금 발동
```
PUT /api/grade-policies/1
{ "criteria": [...] }
```
- ❌ 409 + "이 정책은 N개 평가 기간에 적용 중이므로..." + applied_periods 목록

#### 시나리오 5: 미바인딩 정책 criteria 수정 (정상)
- 시나리오 1에서 만든 "테스트 정책"은 applied_periods 0개
```
PUT /api/grade-policies/{테스트정책ID}
{ "criteria": [...수정값] }
```
- ✅ 200 ok
- ✅ audit_log: GRADE_POLICY_CRITERIA_UPDATED
- ✅ DB에서 criteria 전체 교체 확인

#### 시나리오 6: 정책 삭제 — applied_periods 없는 경우
```
DELETE /api/grade-policies/{테스트정책ID}
```
- ✅ 200 ok, affected_period_count = 0
- ✅ audit_log: GRADE_POLICY_DELETED
- ✅ DB에서 정책 + criteria 모두 삭제 확인 (CASCADE)

#### 시나리오 7: 정책 삭제 — applied_periods 있는 경우 (강제 초기화)
- 임시 정책 생성 → eval_periods 1개에 바인딩 (활성 상태)
- 정책 삭제
- ✅ 200 ok, affected_period_count = 1, "비활성화" 메시지
- ✅ 해당 eval_period의 grade_policy_id = NULL, is_active = 0
- ✅ audit_log: GRADE_POLICY_DELETED + EVAL_PERIOD_POLICY_DETACHED 1건

#### 시나리오 8: 권한 검증
- 일반 직원 토큰으로 POST/PUT/DELETE → 403 forbidden
- admin/master 토큰으로 → 정상

#### 시나리오 9: 사이냅 표준안 보호 확인
- 시드된 "사이냅 표준안"의 applied_periods는 모든 기존 기간 (시드 자동 바인딩으로 다수)
- criteria 수정 시도 → 409 잠금
- 이름만 변경 시도 → 200 정상

### 5. ClaudeHRM.md 갱신

#### 5-1. API 엔드포인트 갱신 (63A에서 GET만 명시했던 부분 보강)

```
GET    /api/grade-policies          등급 정책 목록 + criteria + applied_periods (admin+)
POST   /api/grade-policies          정책 신규 생성 (admin+, name 중복 거부, criteria 검증)
PUT    /api/grade-policies/:id      정책 수정 (admin+, criteria 변경은 applied_periods 0개일 때만)
DELETE /api/grade-policies/:id      정책 삭제 (admin+, applied_periods는 NULL 강제 초기화 + 비활성화)
```

#### 5-2. 설계 원칙 25번 보강 (PROMPT 63A에서 추가된 항목 확장)

기존 25번에 아래 추가:
```
    - 정책 수정 잠금: applied_periods >= 1인 정책은 criteria(cutoff) 수정 불가, 이름·description은 수정 가능
    - 정책 삭제: applied_periods는 grade_policy_id NULL + is_active=0 강제 초기화, audit_log 기록
    - 검증 규칙: criteria 최소 1건, min_score 0~100, sort_order 오름차순 → min_score 단조감소, grade_code·min_score·sort_order 중복 불가
```

#### 5-3. audit_log 액션 목록 갱신 (있다면)

```
GRADE_POLICY_CREATED              등급 정책 신규 생성
GRADE_POLICY_UPDATED              등급 정책 이름·description 수정
GRADE_POLICY_CRITERIA_UPDATED     등급 정책 cutoff 수정 (미바인딩 시에만 가능)
GRADE_POLICY_DELETED              등급 정책 삭제 (영향 기간 ID 목록 포함)
EVAL_PERIOD_POLICY_DETACHED       정책 삭제로 인한 기간의 grade_policy_id NULL 강제
```

#### 5-4. 개발 이력 1줄 추가 (최상단)

```
| 2026-05-29 | 등급 정책 CRUD API 완성 — POST/PUT/DELETE + 검증(단조감소·범위·중복) + cutoff 잠금(applied_periods≥1) + 삭제 시 강제 초기화 + audit_log (PROMPT 63B) | Claude Code |
```

### 6. Git 커밋 (푸시 보류)

```bash
git add server/index.js ClaudeHRM.md
git commit -m "등급 정책 CRUD API 완성 + 검증·잠금·audit_log (PROMPT 63B)"
# git push 금지 — 사용자 명시 승인 후
```

### 7. 사용자 보고

- 시나리오 1~9 통과 결과 보고
- 관리자 UI 임시 깨짐 상태 지속 안내 (63C에서 해소)
- "PROMPT 63B 완료, PROMPT 63C 진행 가능" 보고

---

## 작업 완료 체크리스트

- [ ] 사전 점검 grep 3회 + 결과 보고
- [ ] `validateGradePolicyCriteria` 헬퍼 추가
- [ ] `POST /api/grade-policies` 라우터 추가
- [ ] `PUT /api/grade-policies/:id` 라우터 추가 (단일 + 내부 분기)
- [ ] `DELETE /api/grade-policies/:id` 라우터 추가 (강제 초기화)
- [ ] writeAudit 통합 (또는 직접 INSERT, 사전 점검 패턴)
- [ ] 시나리오 1~9 통과
- [ ] PROMPT 62 + 63A 회귀 확인 (조직 평균, 등급 산출, 활성화 게이트)
- [ ] ClaudeHRM.md 갱신 (API 엔드포인트, 설계 원칙 25번 보강, audit_log 액션, 개발 이력)
- [ ] git commit (푸시 보류)
- [ ] "PROMPT 63B 완료, 63C 진행 가능" 보고

---

## 주의사항

### 트랜잭션
- 정책 생성·수정·삭제는 모두 `db.transaction(() => { ... })` 으로 감쌈
- 부분 실패 시 자동 rollback
- audit_log 작성은 트랜잭션 외부 (커밋 성공 후) — 트랜잭션 롤백 시 audit_log 남지 않게

### 권한
- 모든 쓰기 라우터에 `requireRole(['master', 'admin'])` 적용
- 일반 직원은 GET도 불가? — 사전 점검에서 GET 라우터 권한 확인 후 일관성 유지

### 검증 메시지 한국어
- 모든 검증 실패 메시지는 한국어 (운영 화면에 그대로 표시될 수 있음)
- 사용자 친화적이되 정확한 정보 포함 (어떤 grade_code의 어떤 값이 문제인지)

### 잠금 정책 메시지
- 409 응답에 `applied_periods` 목록 포함 — 사용자가 어느 기간에 영향이 있는지 즉시 확인
- `hint`에 "이름·description은 수정 가능합니다" 명시 — UX 향상

### 데이터 모델 회귀 방지
- PROMPT 63A의 모든 데이터 모델(grade_policies, grade_policy_criteria, eval_periods.grade_policy_id) 절대 변경 금지
- 본 PROMPT는 라우터·검증만 추가, 스키마 변경 없음

### 운영 데이터 영향
- final_evaluations 절대 건드리지 않음
- eval_periods의 기존 grade_policy_id는 보존 (정책 삭제 시에만 NULL 강제 초기화)

### 코드 읽기 가이드
- server/index.js 전체 view 금지
- 사전 점검 grep으로 확정된 line ± 30줄만 view_range
- 헬퍼·라우터 추가 위치는 GET /api/grade-policies 근처에 일관성 유지

### 푸시 정책
- 자동 푸시 ❌ (정책 관리 동작이 시스템 핵심 가드에 영향)
- 검증 통과 + 사용자 명시 승인 후 수동 푸시

---

## 다음 단계

PROMPT 63B 완료 후:
- **PROMPT 63C**: 관리자 UI (등급 정책 관리 탭 신규, 평가 기간 폼에 정책 드롭다운, 미바인딩 알림 배너 모든 관리자 화면 상단 고정 + 클릭 시 설정 이동, 기존 등급 관리 탭 제거)

PROMPT 63C 완료 후 (별도 PROMPT):
- **PROMPT 63D**: 분석 환산 옵션 — 성과 분석 화면에 "현재 cutoff 기준 환산" 토글 + 가상 산출 헬퍼 + 환산 기준 정책 드롭다운 (사용자 결정: 시점 별도, 63B/63C 완성 후 검토)

---

## 본 PROMPT 작성 시 적용된 원칙
- CLAUDE.md "PROMPT 작성 원칙" 3종 모두 적용
- PROMPT 63-PRE 분석 + 사용자 결정사항 인용 (재논의 금지)
- 사용자 선택 옵션 2(단일 라우터 + 내부 구별), 검증 옵션 3(완전), 삭제 옵션 2(강제 초기화) 반영
- 단계 분리 유지 — 63B는 라우터만, UI는 63C로 분리
- 자동 푸시 금지 (정책 핵심 가드 변경)
- audit_log 5개 액션 명시 — 운영 감사 추적성 확보
