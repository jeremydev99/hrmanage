# 작업 36-5: Prisma 5 다운그레이드 반영 + 문서 정합성 정리

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-4 (Repository Pattern + User 어댑터) 완료
> 목적: 36-4에서 Claude Code가 자체 판단으로 진행한 Prisma 7 → 5 다운그레이드를 문서에 정확히 반영
> 위험도: 매우 낮음 (문서 작업만, 코드 변경 없음)
> 후속 작업: PROMPT 36-6 (GoalCategory/GradeCriteria 어댑터, 또는 EvalCycle 어댑터)

---

## 배경

PROMPT 36-4 작업 중 Claude Code가 다음 자체 판단을 했음:
- **Prisma 7.x → 5.x 다운그레이드**: Prisma 7은 너무 최신이라 CommonJS 환경 호환성 복잡
- **prisma.config.ts 삭제**: Prisma 5에서는 schema.prisma만으로 충분
- 사용자 검증 결과 시스템 정상 동작

이로 인해 ClaudeHRM.md를 비롯한 문서에 다음 불일치 발생:
- "Prisma 7.8.0" 기록 → 실제는 5.x
- "prisma.config.ts" 파일 구조 기록 → 실제 삭제됨

이번 PROMPT의 목적은 **문서와 실제 코드의 정합성 회복**.

---

## 작업 전 확인사항

1. 현재 브랜치가 `feat/prisma-orm`인지 확인 (`git branch`)
2. `git status`가 깨끗한지 확인 (36-4 작업 모두 commit/push 완료)
3. CLAUDE.md, ClaudeHRM.md 먼저 읽기
4. **실제 Prisma 버전 확인** (`npx prisma --version`) — 정정의 기준 데이터

---

## 작업 1: 실제 Prisma 버전 확인

가장 먼저 정확한 현재 버전을 확인:

```bash
npx prisma --version
```

기대 출력 예시:
```
prisma                  : 5.x.x
@prisma/client          : 5.x.x
```

**이 정확한 버전 번호를 사용자 보고와 문서에 사용.** 추측 금지.

---

## 작업 2: ClaudeHRM.md 정정

### 2-1) "기술 스택 상세" 섹션 정정

기존:
```
ORM:        Prisma (스키마 기반, 멀티 DB 지원)
```

수정 후:
```
ORM:        Prisma 5.x (스키마 기반, 멀티 DB 지원)
            - 개발: SQLite
            - 운영: PostgreSQL (추후 전환)
            - 향후 어댑터: MySQL, MSSQL, Oracle (Repository Pattern으로 확장)
            ※ Prisma 7은 CommonJS 호환 복잡으로 5.x 사용 결정 (2026-05-14)
```

### 2-2) "파일 구조" 섹션 정정

기존 항목 중 다음을 삭제:
```
├── prisma.config.ts          ← Prisma 7 설정 (DATABASE_URL 연결)
```
(또는 비슷한 위치에 prisma.config.ts 참조가 있다면 그것 삭제)

`prisma/` 폴더 항목은 유지:
```
├── prisma/
│   ├── schema.prisma          ← Prisma 스키마 정의 (20개 테이블)
│   └── migrations/            ← 추후 마이그레이션 파일들 (현재 없음)
```

### 2-3) "최근 개발 이력" 표 최상단에 추가

```
| 2026-05-14 | Prisma 7→5 다운그레이드 반영, 문서 정합성 정리 (PROMPT_36-5) | Claude Code |
```

### 2-4) "환경변수 (.env)" 섹션 점검

`DATABASE_URL` 항목은 그대로 유지. 다른 환경변수 영향 없음.

---

## 작업 3: 마케팅 포인트 섹션 정정

ClaudeHRM.md의 "제품화 마케팅 포인트 (Product Selling Points)" 섹션 안의 다음 항목 확인:

### 3-1) "기술 스택 차별화" 첫 번째 항목

PROMPT 36-4에서 업데이트했던 내용이 있다면 버전 정보 추가:

```markdown
- [x] **멀티 DB 지원 아키텍처** — Prisma ORM 5.x + Repository Pattern 골격 구축 완료 (User 어댑터 기준)
  - 추가 어댑터(PostgreSQL/MySQL/MSSQL/Oracle 등) 확장 가능
  - 환경변수 한 줄(DATA_ADAPTER)로 어댑터 전환
```

핵심: **Prisma 버전 명시 (5.x)**.

---

## 작업 4: 검증 — package.json 확인

다음 명령으로 package.json의 실제 의존성 버전 확인:

```bash
findstr "prisma" package.json
```

기대 결과 (5.x 버전이 명시되어 있어야 함):
```
"@prisma/client": "^5.x.x"
"prisma": "^5.x.x"
```

만약 여기 7.x로 남아 있다면 다운그레이드가 완전히 안 된 상태. 사용자에게 보고.

---

## 작업 5: 자동 git 커밋

```bash
cd C:\claudeprojects\hrmanage
git add ClaudeHRM.md
git commit -m "Prisma 7→5 다운그레이드 문서 반영 (PROMPT_36-5)"
```

**push는 사용자가 직접 실행** (PROMPT 35 규칙).

---

## 작업 완료 후 보고할 내용

1. `npx prisma --version` 결과 (실제 버전)
2. `findstr "prisma" package.json` 결과
3. ClaudeHRM.md 수정된 섹션들 (4곳 정도)
4. 자동 커밋 해시
5. **사용자가 직접 할 일**:
   - 변경 사항 git diff로 확인
   - 이상 없으면 `git push`

---

## ⚠️ 절대 하지 말 것

- ❌ **Prisma 버전 재변경 시도** (5↔7 또는 다른 버전) — 정합성 정리만, 버전 변경 금지
- ❌ **server/index.js 수정** — 이번 PROMPT 범위 외
- ❌ **schema.prisma 수정** — 이번 PROMPT 범위 외
- ❌ **새 라우터 전환 작업** — 36-6 이후 작업
- ❌ **package.json의 dependencies 수정** — 단순 조회만, 변경 금지
- ❌ **`npx prisma generate` 실행** — 코드 변경 없으므로 불필요
- ❌ **`git push` 실행** — 사용자가 직접 함 (PROMPT 35 규칙 엄수)

---

## 향후 작업 예고 — PROMPT 36-6

문서 정리 완료 후 본격적인 어댑터 확장:

- PROMPT 36-6 후보 1: GoalCategory + GradeCriteria 어댑터 (정적 데이터, 안전)
- PROMPT 36-6 후보 2: EvalCycle + Goal 어댑터 (핵심 비즈니스, 가치 높음)

본인이 36-5 완료 후 결정 예정.
