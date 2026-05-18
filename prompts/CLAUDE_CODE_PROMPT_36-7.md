# 작업 36-7: schema.prisma의 datetime default 정리 + 잘못 저장된 데이터 수정

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-1 ~ 36-6 모두 완료
> 목적: 36-6 검증 중 발견된 `@default("datetime('now')")` 문제 해결 + 잘못 저장된 GoalCategory 4번 항목 정리
> 위험도: 중상 (schema.prisma 수정 + 실제 DB 데이터 수정 포함)
> 후속 작업: PROMPT 36-8 (GradeCriteria 어댑터 — 깨끗한 created_at 기반)

---

## 배경 — 36-6에서 발견된 문제

PROMPT 36-6의 검증 중 사용자가 발견한 사실:

### 문제 A: schema.prisma의 datetime default 문제
- schema.prisma의 거의 모든 모델에 `created_at String? @default("datetime('now')")` 정의
- 이 표현은 Prisma 입장에서 **SQL 함수 호출이 아닌 문자열 기본값**
- 결과: Prisma의 `create()`로 INSERT한 데이터의 `created_at`이 실제로 `"datetime('now')"` 라는 7글자 문자열로 저장됨

### 문제 B: 이미 잘못 저장된 데이터
- 36-6 검증 중 추가한 GoalCategory id=4 ("테스트 카테고리 수정됨")의 created_at이 `"datetime('now')"` 문자열
- 다른 컬럼(이름, 가중치, 색 등)은 정상

### 문제 C: 클라이언트 삭제 UI 버그 (이 PROMPT 범위 외)
- 카테고리 관리 페이지의 삭제 버튼이 DELETE API를 호출하지 않음
- 이건 admin.js 클라이언트 코드 문제로, 별도 PROMPT(36-9 이후)에서 처리
- 이번 PROMPT에서는 **Prisma Studio로 직접 4번 항목을 정리**만 함

---

## 이번 작업의 범위

### 포함
1. schema.prisma의 모든 `@default("datetime('now')")` 정리
2. Prisma Client 재생성
3. 잘못 저장된 GoalCategory id=4 항목 정리 (Prisma Studio로 영구 삭제)
4. 문서 업데이트

### 제외
- ❌ 클라이언트 삭제 UI 버그 (별도 PROMPT)
- ❌ 새 어댑터 추가 (36-8에서)
- ❌ 다른 라우터 전환 (36-8 이후)

---

## 작업 전 확인사항

1. 현재 브랜치가 `feat/prisma-orm`인지 확인 (`git branch`)
2. `git status`가 깨끗한지 확인 (36-6 작업 모두 commit/push 완료)
3. CLAUDE.md, ClaudeHRM.md 먼저 읽기
4. 기존 시스템이 정상 동작하는지 확인 (`node server/index.js` → http://localhost:3000 → ceo 로그인 가능)
5. **현재 schema.prisma의 datetime default 위치를 모두 파악**

---

## 작업 1: schema.prisma 분석 — 영향받는 위치 파악

다음 명령으로 영향받는 라인 모두 찾기:

```bash
findstr /n "datetime" prisma\schema.prisma
```

예상 결과 — 다음 패턴이 여러 모델에 있을 것:

```
created_at  String? @default("datetime('now')")
updated_at  String? @default("datetime('now')")
```

영향받는 모델 (추정):
- User
- Organization
- EvalCycle (created_at, updated_at)
- Goal
- GoalCategory
- GoalApproval
- Feedback
- FeedbackItem
- FinalEvaluation (created_at, updated_at)
- FinalEvalScore
- ProgressReport (created_at, updated_at)
- ReportFile
- EvalPeriod
- EvalPeriodMode
- AuditLog
- GradeCriteria
- OkrCycle (created_at, updated_at)

거의 모든 모델이 영향받음.

---

## 작업 2: 수정 방향 결정

### 두 가지 옵션이 있음

#### 옵션 A: `@default` 제거 (간단, 안전)
```prisma
// Before
created_at  String? @default("datetime('now')")

// After
created_at  String?
```

장점:
- SQLite는 컬럼 정의 시 이미 `DEFAULT (datetime('now'))` 가 있으므로, INSERT 시 created_at을 명시 안 하면 SQLite가 자동으로 SQL 함수 실행
- Prisma의 `create()`도 created_at을 명시하지 않으면 DB 측 DEFAULT 사용
- 가장 빠르고 위험도 낮음

단점:
- 의도가 명확하지 않음 (코드만 봐서는 어떻게 created_at이 채워지는지 모름)

#### 옵션 B: Prisma 표준 `@default(now())` 사용
```prisma
// Before
created_at  String? @default("datetime('now')")

// After
created_at  DateTime? @default(now())
```

장점:
- Prisma 표준
- PostgreSQL 호환성 더 좋음
- 코드만 봐도 의도 명확

단점:
- String → DateTime 타입 변경 = **기존 데이터 호환성 검증 필요**
- 기존 DB의 created_at은 텍스트로 저장되어 있음
- 마이그레이션 부담 있음

### ✅ 이번 작업은 옵션 A 선택

이유:
- 36-7의 목표는 **버그 수정**이지 대규모 마이그레이션이 아님
- 옵션 B는 PROMPT 36-10 이후 PostgreSQL 전환 시 함께 처리
- 위험 최소화

---

## 작업 3: schema.prisma 수정

`prisma/schema.prisma` 파일을 열어서 **모든** 다음 패턴을 정리:

```prisma
// Before (수정 대상)
created_at  String? @default("datetime('now')")
updated_at  String? @default("datetime('now')")

// After (수정 후)
created_at  String?
updated_at  String?
```

### 수정 절차

각 모델을 하나씩 차례로 검토하면서 다음 패턴 제거:
- `@default("datetime('now')")` 부분만 제거
- `created_at  String?` 또는 `updated_at  String?` 형태로 남김
- 다른 필드는 절대 건드리지 않음

### 영향 받지 않는 부분 (건드리지 말 것)

다음은 그대로 유지:
- `name` 같은 일반 필드의 default
- `is_active Int? @default(1)` 같은 숫자 default
- `eval_mode String? @default("MBO")` 같은 명시적 문자열 default
- `weight Int? @default(0)` 같은 숫자 default
- `@id @default(autoincrement())` 같은 ID
- `@map`, `@@map`, `@@unique` 같은 메타 어노테이션

**오직 `@default("datetime('now')")` 만 제거.**

---

## 작업 4: Prisma Client 재생성

schema.prisma 수정 후:

```bash
npx prisma generate
```

기대 결과: `✔ Generated Prisma Client (5.22.0) to ./generated/prisma`

에러 없이 끝나면 OK.

---

## 작업 5: 자체 검증 — 수정 확인

수정이 모두 반영됐는지 확인:

```bash
findstr /c:"datetime('now')" prisma\schema.prisma
```

기대 결과: **아무 결과 없음** (모두 제거됨)

만약 한두 줄이 남았다면 수동으로 다시 확인.

---

## 작업 6: 동작 테스트 — 신규 데이터의 created_at 확인

임시 스크립트로 새 카테고리 추가 후 created_at 값 확인:

### 파일: `test-datetime-default.js` (임시)

```javascript
require('dotenv').config();
const { getSharedPrismaClient } = require('./server/config/repository-factory');

(async () => {
  const prisma = getSharedPrismaClient();
  try {
    console.log('=== 신규 GoalCategory 생성 테스트 ===');
    const created = await prisma.goalCategory.create({
      data: {
        name: '테스트_검증용_' + Date.now(),
        description: 'created_at 검증용',
        weight: 0,
        color: '#E6F1FB',
        textColor: '#0C447C',
        sortOrder: 999,
        created_by: 1,
      }
    });

    console.log('생성된 ID:', created.id);
    console.log('created_at:', created.created_at);

    // 검증
    if (created.created_at === "datetime('now')") {
      console.log('❌ 문제 미해결: created_at이 여전히 문자열');
    } else if (created.created_at && created.created_at.includes('-') && created.created_at.includes(':')) {
      console.log('✅ 문제 해결: created_at이 실제 datetime 형식 (예: 2026-05-14 ...)');
    } else if (created.created_at === null) {
      console.log('⚠️ created_at이 null — DB DEFAULT가 작동 안 했을 수 있음');
    } else {
      console.log('⚠️ 예상치 못한 값:', JSON.stringify(created.created_at));
    }

    // 정리: 방금 만든 테스트 데이터 즉시 삭제
    await prisma.goalCategory.delete({ where: { id: created.id } });
    console.log('테스트 데이터 정리 완료');

    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('에러:', e);
    process.exit(1);
  }
})();
```

### 실행

```bash
node test-datetime-default.js
```

기대 결과 — 다음 셋 중 하나:
- **✅ "문제 해결: created_at이 실제 datetime 형식..."** — 정상
- "⚠️ created_at이 null" — DB의 DEFAULT가 작동 안 함 (사용자에게 보고 필요)
- "❌ 문제 미해결" — schema 수정이 반영 안 됨 (재확인 필요)

### 테스트 후

```bash
del test-datetime-default.js
```

⚠️ **CRUD 자동 테스트의 위험**: 이 스크립트는 카테고리를 만들고 즉시 삭제하므로 영향이 제한적. 다만 결과를 사용자에게 정확히 보고할 것.

---

## 작업 7: 잘못 저장된 GoalCategory id=4 정리

### ⚠️ 이 단계는 사용자가 직접 수행

Claude Code는 **DB 직접 수정 명령을 실행하지 않음**. 사용자가 Prisma Studio로 수동 정리.

### 사용자 안내 메시지에 포함할 내용

```
[사용자 직접 수행 단계]

1. PowerShell에서:
   npx prisma studio

2. 브라우저에서 좌측 사이드바 → `goal_categories` 클릭

3. id=4 행 ("테스트 카테고리 수정됨") 찾기

4. 해당 행 우측 휴지통 아이콘 클릭

5. "Delete 1 record" 확인 클릭

6. 영구 삭제 완료
```

---

## 작업 8: 문서 업데이트

### 8-1) ClaudeHRM.md 최근 개발 이력 표 최상단에 추가

```
| 2026-05-14 | schema.prisma의 datetime default 정리 + GoalCategory id=4 정리 (PROMPT_36-7) | Claude Code |
```

### 8-2) ClaudeHRM.md 핵심 설계 원칙 섹션에 추가

기존 설계 원칙 16번 또는 마지막 번호 다음에:

```markdown
17. **datetime 기본값 처리** (2026-05-14, PROMPT_36-7):
    - schema.prisma에서 `@default("datetime('now')")` 사용 금지
    - 이유: Prisma는 이를 문자열 기본값으로 인식 (SQL 함수 호출 아님)
    - 해결: 해당 어노테이션 제거 → SQLite의 컬럼 DEFAULT가 자동 처리
    - PostgreSQL 전환 시 `DateTime? @default(now())` 형태로 재정의 예정
```

(기존 17번이 있다면 18번으로)

### 8-3) ClaudeHRM.md 알려진 버그 섹션에 추가

기존 "알려진 버그" 또는 비슷한 섹션에 한 줄 추가:

```markdown
### 🟡 알려진 클라이언트 UI 버그 (별도 처리 예정)
- 관리자 페이지 > 카테고리 관리: 삭제 버튼이 DELETE API를 호출하지 않음
  - 화면에서는 즉시 제거되지만 DB는 그대로
  - 저장 버튼은 PUT만 호출하여 삭제 명령 누락
  - PROMPT 36-9 이후 admin.js 수정 예정
```

---

## 작업 9: 자동 git 커밋

```bash
cd C:\claudeprojects\hrmanage
git add prisma/schema.prisma ClaudeHRM.md
git commit -m "schema.prisma datetime default 정리 (PROMPT_36-7)"
```

**push는 사용자가 직접 실행** (PROMPT 35 규칙).

---

## 작업 완료 후 보고할 내용

1. **수정된 파일** (2개): prisma/schema.prisma, ClaudeHRM.md
2. **schema.prisma 변경 요약**:
   - `@default("datetime('now')")` 제거된 모델 개수
   - 각 모델별 영향받은 필드 수
3. **`npx prisma generate` 결과** — 성공 메시지
4. **자체 테스트 결과** (`test-datetime-default.js`):
   - 생성된 카테고리의 created_at 값
   - 검증 결과 (✅/⚠️/❌)
5. **자동 커밋 해시**
6. **사용자가 직접 할 일**:
   - Prisma Studio로 GoalCategory id=4 영구 삭제
   - 서버 재시작 후 기존 시스템 동작 확인
   - `git push`

---

## 사용자 검증 체크리스트

### Step 1: 작업 결과 확인

#### 1-A: schema.prisma 변경 확인
```powershell
findstr /c:"datetime('now')" prisma\schema.prisma
```
**기대**: 아무 결과 없음

#### 1-B: 자체 테스트 결과 확인
보고에서 `✅ 문제 해결` 메시지가 있어야 함.

### Step 2: GoalCategory id=4 정리

```powershell
npx prisma studio
```

브라우저 자동 열림 → 좌측 `goal_categories` → id=4 행 → 휴지통 → 삭제 확인

### Step 3: 서버 재시작 + 동작 검증

#### 3-A: 서버 재시작
포트 충돌 시:
```powershell
netstat -ano | findstr :3000
taskkill /F /PID <PID>
node server/index.js
```

#### 3-B: 로그인 후 카테고리 관리 진입
- ceo 로그인 → 관리자 → 카테고리 관리
- 카테고리 3개만 정상 표시 (id=4가 삭제됐으므로)
- 새 카테고리 추가 시도 → 추가됨 → Prisma Studio에서 새로 만든 카테고리의 created_at 확인 (정상 datetime 형식이어야 함)

#### 3-C: dev3로 평가 작성
- 카테고리 드롭다운에 3개 카테고리 정상 표시
- 평가 작성 진행 정상

### Step 4: 이상 없으면 push

```powershell
git push
```

---

## 예상 문제와 대처

| 증상 | 원인 | 해결 |
|------|------|------|
| `prisma generate` 실패 | schema 문법 오류 | 에러 메시지의 줄 번호 확인 |
| 자체 테스트에서 created_at이 null | DB 컬럼의 DEFAULT가 없음 | 사용자에게 보고, 추가 작업 결정 |
| 기존 데이터 모두 사라짐 | 절대 발생 안 함 (DELETE 안 함) | - |
| 카테고리 추가는 되는데 시간 표시가 깨짐 | created_at이 null 또는 다른 형식 | 자체 테스트 결과로 사전 확인 |
| 기존 카테고리들의 created_at도 변경됨 | 발생 안 함 (UPDATE 안 함) | - |

---

## ⚠️ 절대 하지 말 것

- ❌ **`npx prisma db push` 실행** — DB 강제 변경 위험
- ❌ **`npx prisma migrate reset` 실행** — DB 초기화 위험
- ❌ **기존 데이터 수정** — Prisma Studio 사용은 사용자만
- ❌ **schema.prisma에서 datetime 외 다른 필드 변경** — 범위 외
- ❌ **server/index.js 수정** — 이번 PROMPT 범위 외
- ❌ **admin.js 수정** (카테고리 삭제 UI 버그) — 36-9 이후로 분리
- ❌ **자동 git push 실행** — 사용자가 직접

---

## 향후 작업 예고 — PROMPT 36-8

이 작업 완료 후:
- **36-8**: GradeCriteria 어댑터 + `/api/grade-criteria` 4개 라우터 전환
  - 깨끗한 created_at 기반에서 진행
  - GoalCategory와 같은 패턴 반복
  - 관리자 페이지 등급 기준 관리 탭에서 검증

추가로 향후 PROMPT 36-9 이후:
- admin.js 카테고리 삭제 UI 버그 수정 (DELETE API 호출 추가)
- 같은 패턴의 다른 UI 버그도 정리
