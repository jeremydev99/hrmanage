# PROMPT 36-8: GradeCriteria 어댑터 (인터페이스 + Prisma 구현체 + 라우터 4개 전환)

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-1 ~ 36-7 모두 완료 (push 완료)
> 패턴: PROMPT 36-6 (GoalCategory)과 동일한 흐름 반복
> 위험도: 낮음 (검증된 패턴)
> 예상 소요: 30분 이내

---

## 배경

PROMPT 36-6에서 GoalCategory를 Repository Pattern으로 전환했고, 36-7에서 schema datetime default 정리까지 완료됐습니다. 이제 같은 패턴을 GradeCriteria에도 적용합니다.

**GoalCategory와의 차이점 — 단 하나**:
- DELETE 권한: GoalCategory는 `masterOnly`, **GradeCriteria는 `adminOnly`**
- 비즈니스 규칙: GradeCriteria는 **최소 2개 등급을 유지**해야 함 (DELETE 시 검증)
- DELETE 후 sort_order 재정렬 로직 있음

---

## 작업 범위

### 1. 새 파일 2개 생성

```
server/repositories/GradeCriteriaRepository.js          (인터페이스)
server/repositories/PrismaGradeCriteriaRepository.js    (Prisma 구현체)
```

### 2. 기존 파일 2개 수정

```
server/repositories/index.js                            (팩토리에 추가)
server/index.js                                         (라우터 4개 Repository로 전환)
```

---

## 작업 지시

### 1단계 — 인터페이스 파일 생성

`server/repositories/GradeCriteriaRepository.js` 파일을 새로 만들고 아래 내용 작성:

```javascript
/**
 * GradeCriteriaRepository — 등급 기준 데이터 접근 인터페이스
 * 모든 구현체는 이 메서드 시그니처를 따라야 함
 */
class GradeCriteriaRepository {
  async findAll() {
    throw new Error('Not implemented');
  }
  async findById(id) {
    throw new Error('Not implemented');
  }
  async create(data) {
    throw new Error('Not implemented');
  }
  async update(id, data) {
    throw new Error('Not implemented');
  }
  async delete(id) {
    throw new Error('Not implemented');
  }
  async count() {
    throw new Error('Not implemented');
  }
  async getMaxSortOrder() {
    throw new Error('Not implemented');
  }
  async resequenceSortOrder() {
    throw new Error('Not implemented');
  }
}

module.exports = GradeCriteriaRepository;
```

---

### 2단계 — Prisma 구현체 파일 생성

`server/repositories/PrismaGradeCriteriaRepository.js` 파일을 새로 만들고 아래 내용 작성:

```javascript
const GradeCriteriaRepository = require('./GradeCriteriaRepository');

class PrismaGradeCriteriaRepository extends GradeCriteriaRepository {
  constructor(prisma) {
    super();
    this.prisma = prisma;
  }

  async findAll() {
    return await this.prisma.grade_criteria.findMany({
      orderBy: { sort_order: 'asc' }
    });
  }

  async findById(id) {
    return await this.prisma.grade_criteria.findUnique({
      where: { id: Number(id) }
    });
  }

  async create(data) {
    return await this.prisma.grade_criteria.create({
      data: {
        grade_code: data.grade_code,
        grade_name: data.grade_name,
        description: data.description || '',
        note: data.note || '',
        sort_order: data.sort_order
      }
    });
  }

  async update(id, data) {
    const updateData = {
      grade_code: data.grade_code,
      grade_name: data.grade_name,
      description: data.description || '',
      note: data.note || ''
    };
    if (data.sort_order !== undefined && data.sort_order !== null) {
      updateData.sort_order = data.sort_order;
    }
    return await this.prisma.grade_criteria.update({
      where: { id: Number(id) },
      data: updateData
    });
  }

  async delete(id) {
    return await this.prisma.grade_criteria.delete({
      where: { id: Number(id) }
    });
  }

  async count() {
    return await this.prisma.grade_criteria.count();
  }

  async getMaxSortOrder() {
    const result = await this.prisma.grade_criteria.aggregate({
      _max: { sort_order: true }
    });
    return result._max.sort_order || 0;
  }

  async resequenceSortOrder() {
    const remaining = await this.prisma.grade_criteria.findMany({
      orderBy: { sort_order: 'asc' },
      select: { id: true }
    });
    for (let i = 0; i < remaining.length; i++) {
      await this.prisma.grade_criteria.update({
        where: { id: remaining[i].id },
        data: { sort_order: i + 1 }
      });
    }
  }
}

module.exports = PrismaGradeCriteriaRepository;
```

---

### 3단계 — 팩토리(`server/repositories/index.js`) 갱신

기존 `server/repositories/index.js` 파일을 열어서, GoalCategory와 같은 방식으로 GradeCriteria도 추가합니다.

GoalCategory 추가 패턴을 그대로 따라하면 됩니다:

1. 파일 상단의 `require` 섹션에 두 줄 추가:
```javascript
const GradeCriteriaRepository = require('./GradeCriteriaRepository');
const PrismaGradeCriteriaRepository = require('./PrismaGradeCriteriaRepository');
```

2. 팩토리 export 객체에 `gradeCriteria` 항목 추가 (GoalCategory 항목 바로 아래):
```javascript
gradeCriteria: new PrismaGradeCriteriaRepository(prisma),
```

3. 인터페이스 export 부분에도 추가:
```javascript
GradeCriteriaRepository,
PrismaGradeCriteriaRepository,
```

**주의**: 36-6에서 만든 GoalCategory 패턴을 정확히 따라야 함. 기존 코드 형식을 깨지 않도록.

---

### 4단계 — `server/index.js`의 GradeCriteria 라우터 4개 전환

`server/index.js`의 1961번째 줄 근처에 있는 `/api/grade-criteria` 라우터 4개를 모두 Repository 호출로 전환합니다.

#### 4-1. GET /api/grade-criteria

**기존**:
```javascript
app.get('/api/grade-criteria', auth, (req, res) => {
  // ... 기존 db.prepare(...).all() 호출
});
```

**변경 후**:
```javascript
app.get('/api/grade-criteria', auth, async (req, res) => {
  try {
    const list = await repos.gradeCriteria.findAll();
    res.json(list);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

#### 4-2. POST /api/grade-criteria

**변경 후**:
```javascript
app.post('/api/grade-criteria', auth, adminOnly, async (req, res) => {
  try {
    const { grade_code, grade_name, description, note, sort_order } = req.body;
    if (!grade_code || !grade_name) {
      return res.status(400).json({ error: '등급 코드와 명칭은 필수입니다.' });
    }
    const finalSort = sort_order || ((await repos.gradeCriteria.getMaxSortOrder()) + 1);
    const created = await repos.gradeCriteria.create({
      grade_code,
      grade_name,
      description,
      note,
      sort_order: finalSort
    });
    res.json({ id: created.id });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

#### 4-3. PUT /api/grade-criteria/:id

**변경 후**:
```javascript
app.put('/api/grade-criteria/:id', auth, adminOnly, async (req, res) => {
  try {
    const { grade_code, grade_name, description, note, sort_order } = req.body;
    await repos.gradeCriteria.update(req.params.id, {
      grade_code,
      grade_name,
      description,
      note,
      sort_order
    });
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

#### 4-4. DELETE /api/grade-criteria/:id

**변경 후**:
```javascript
app.delete('/api/grade-criteria/:id', auth, adminOnly, async (req, res) => {
  try {
    const total = await repos.gradeCriteria.count();
    if (total <= 2) {
      return res.status(400).json({ error: '최소 2개 이상의 등급이 필요합니다.' });
    }
    await repos.gradeCriteria.delete(req.params.id);
    await repos.gradeCriteria.resequenceSortOrder();
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

**중요한 변경 사항**:
- 모든 라우터에 `async` 키워드 추가
- `db.prepare(...).run/get/all()` → `await repos.gradeCriteria.xxx()`
- 한글 에러 메시지 깨진 부분(`?깃툒 肄붾뱶`, `理쒖냼 2媛`)을 **정상 한글**로 복원
- DELETE의 sort_order 재정렬 로직을 `resequenceSortOrder()` 메서드로 캡슐화

---

## 검증 절차

작업 완료 후 다음 순서로 검증:

### 1. 서버 정상 기동
```powershell
node server\index.js
```
오류 메시지 없이 `Server listening on port 3000` 표시 확인.

### 2. 관리자 페이지 등급 기준 관리 탭 접속
- 로그인: ceo@synapsoft.com / admin1234
- 관리자 → 등급 기준 관리 탭

### 3. CRUD 4가지 모두 검증

| 동작 | 검증 항목 |
|------|-----------|
| GET (목록) | 기존 등급 목록이 sort_order 순서로 정상 표시 |
| POST (추가) | "테스트등급" 추가 시 목록에 sort_order 자동 부여되어 추가됨 |
| PUT (수정) | 추가한 항목 수정 시 정상 반영 |
| DELETE (삭제) | 추가한 항목 삭제 시 목록에서 사라지고 sort_order 재정렬됨 |

### 4. 비즈니스 규칙 검증

- 등급이 2개 이하일 때 DELETE 시도 → `"최소 2개 이상의 등급이 필요합니다."` 응답 확인

### 5. 권한 검증

- 일반 user 계정(`dev3@synapsoft.com`)으로 POST/PUT/DELETE 시도 → 권한 거부 응답
- admin 권한(`hr2@synapsoft.com`)으로는 모든 동작 가능

### 6. 데이터 정합성 검증

```powershell
npx prisma studio
```
- grade_criteria 테이블의 created_at 컬럼이 정상 datetime 형식으로 저장됐는지 확인 (36-7 효과)

---

## 완료 후 처리

1. **변경사항 확인**:
```powershell
git status
git diff
```

2. **CLAUDE.md 업데이트**: 현재 진행 상황 한 줄 추가
   - 예: "36-8 GradeCriteria 어댑터 완료 (Repository Pattern 3번째 적용 사례)"

3. **ClaudeHRM.md의 "최근 개발 이력" 표 상단에 한 줄 추가**:
```
| 2026-05-14 | PROMPT 36-8: GradeCriteria Repository 어댑터 + 라우터 4개 전환 | Claude Code |
```

4. **커밋 + 푸시**:
```powershell
git add server/repositories/GradeCriteriaRepository.js
git add server/repositories/PrismaGradeCriteriaRepository.js
git add server/repositories/index.js
git add server/index.js
git add CLAUDE.md
git add ClaudeHRM.md
git commit -m "feat(repository): GradeCriteria Repository Pattern 적용 (36-8)

- GradeCriteriaRepository 인터페이스 추가
- PrismaGradeCriteriaRepository 구현체 추가
- /api/grade-criteria 라우터 4개 Repository 패턴으로 전환
- 한글 에러 메시지 인코딩 깨짐 복원
- DELETE 시 최소 2개 유지 비즈니스 규칙 및 sort_order 재정렬 캡슐화"
git push
```

---

## 다음 작업 (36-9 예고)

GradeCriteria까지 완료하면 Repository Pattern 적용 사례가 3개(User, GoalCategory, GradeCriteria) 누적됩니다. 패턴이 충분히 검증된 시점.

36-9부터는 **본격적인 비즈니스 객체**로 확장:
- EvalCycle (평가 사이클)
- Goal (목표)
- Organization (조직)

이 객체들은 관계가 복잡하므로 한 번에 하나씩 진행 예정.

---

## 작업 시 주의사항

- 36-6 GoalCategory 작업 시 검증된 패턴을 정확히 따를 것
- 한글 에러 메시지 깨진 부분(파일 인코딩)은 이번에 복원
- 라우터 4개 모두 `async` 키워드 누락 없이 추가
- repos.gradeCriteria 호출 부분에서 `await` 누락 없이 사용
- DELETE의 `resequenceSortOrder()` 호출 순서: DELETE 후 → 재정렬 호출
