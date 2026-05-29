# CLAUDE_CODE_PROMPT_63-PRE — 등급 경계 명시화 영향 분석 (코드 변경 없음)

## 실행 트리거

사용자가 "PROMPT 63-PRE 진행해줘" 발언 시 본 PROMPT 시작.
완료 후 "PROMPT 63-PRE 완료" 보고 + 분석 보고서 제출 + PROMPT 63 본 작업 진행 가능 안내.

---

## 작업 개요

PROMPT 62 완료 후 발견된 구조적 비일관성을 코드 변경 없이 분석. 등급 경계가 코드 공식에 하드코딩되어 있어 점수↔등급 변환이 비직관적으로 동작하는 문제의 영향 범위를 사전 점검.

**문제 정의 (SESSION_HANDOFF 2026-05-28 기록)**:

1. **등급 경계가 DB가 아닌 코드 공식에 하드코딩**:
   - `scoreToGrade`가 `s × 5 / 100 + 1` 반올림 선형 공식 사용 (추정 — 사전 점검에서 확정)
   - 결과 경계: OI ≥ 90, EE 70~90, SC 50~70 등의 비대칭 구간
2. **`grade_criteria` 테이블에 cutoff 컬럼 없음**:
   - 현재 컬럼: `id, grade_code, sort_order, is_active` — `min_score / max_score` 부재
3. **scoreToGrade(반올림)와 codeToScore(역매핑) 비대칭**:
   - codeToScore: OI=6, EE=5, ... (1-6 정수 매핑)
   - PROMPT 62에서 buildGradeMap의 maxScore를 6→100으로 변경했으나, codeToScore 자체는 아직 정수 매핑일 수 있음 (사전 점검에서 확정)
   - **89.19점이 EE로 판정되는 비직관 현상** — 평균 89.19를 표시하면서도 등급은 EE(보통 80점대 이하 범주로 해석되는 라벨)로 나옴
4. **관리자가 등급 기준을 조정 불가** — 모든 변경이 코드 수정 필요

**사용자 결정 사항 (2026-05-28, SESSION_HANDOFF 인용)**:
- 등급 경계를 **명시적 cutoff로 DB화** (grade_criteria에 min_score 등 추가)
- scoreToGrade가 코드 공식 대신 **DB cutoff 참조**
- 점수↔등급 변환을 한 가지 논리로 일치

**63-PRE 목표**: 위 변경의 영향 범위·마이그레이션 필요 여부·관리자 UI 추가 범위·기존 final_grade 재산출 여부를 코드 변경 없이 명확히 식별하여 PROMPT 63 본 작업의 범위를 확정.

## 작업 위험도: 0 (코드 변경 없이 분석만)
## 자동 푸시 여부: 해당 없음 (커밋 없음, 분석 보고서만 생성)

---

## 코드 읽기 가이드 (압축 방지)

본 작업은 다음 영역만 읽고 진행. **전체 파일 view 금지**, view_range 필수.

### 사전 점검 grep (5회 이내, 분석 위치 확정)

```bash
# 1) scoreToGrade 함수 — server + scripts 양쪽
findstr /s /n "scoreToGrade\|grade_score\|gradeScore" server\ scripts\

# 2) codeToScore + buildGradeMap — PROMPT 62에서 변경된 영역
findstr /s /n "codeToScore\|buildGradeMap\|maxScore" server\index.js scripts\seed-eval-data.js

# 3) grade_criteria 테이블 스키마 — DDL + 시드 데이터
findstr /s /n "grade_criteria\|CREATE TABLE grade\|INSERT INTO grade_criteria" server\ scripts\ prisma\

# 4) final_grade / selected_grade 산출 경로 — 점수→등급 변환 호출부
findstr /s /n "final_grade\|selected_grade" server\index.js scripts\

# 5) 등급 관리 라우터 + 관리자 UI
findstr /s /n "/api/grade-criteria\|renderGradeCriteria\|gradeCriteriaList" server\index.js public\js\
```

**확정해야 할 6가지** (분석 보고서에 정확히 기록):
1. `scoreToGrade` 현재 공식 — PROMPT 62 변경 후 상태
2. `codeToScore` / `buildGradeMap` 현재 상태 + **사용처 전수**
3. `grade_criteria` 현재 스키마 + 시드 데이터 행 목록
4. `final_grade` / `selected_grade` 산출 경로 + 호출부 line 번호
5. 관리자 UI(grade-criteria) 현재 편집 가능 필드 목록
6. PROMPT 62에서 maxScore 6→100 변경한 위치와 그 영향이 codeToScore에도 미쳤는지

### 확정 후 읽을 영역 (좁게)
- `server/index.js`: `scoreToGrade`, `codeToScore`, `buildGradeMap` 본문 (grep 확정 line ± 20줄)
- `server/index.js`: `/api/grade-criteria` CRUD 라우터 4개 (각 line ± 15줄)
- `scripts/seed-eval-data.js`: scoreToGrade 사용처 + loadGrades (grep 확정 line ± 20줄)
- `prisma/schema.prisma` 또는 server의 CREATE TABLE: `grade_criteria` 정의
- `public/js/pages/admin.js`: `renderGradeCriteria` 또는 등급 관리 UI (grep 확정 line ± 30줄)

**그 외 코드 view 금지.** 특히 server/index.js 전체 view 금지, Prisma 어댑터 8개 일괄 view 금지.

---

## 분석 대상 — 6개 영역

### 1. scoreToGrade 현재 공식 정확히 파악

PROMPT 62 변경 후 상태 확인. 다음 질문에 답할 것:

- 현재 공식의 정확한 표현 (코드 인용, line 번호 포함)
- 입력 스케일: 0-100인지, 0-5인지, 다른지
- 출력 등급 코드: 고정 매핑(OI/EE/SC/IR/NC)인지, grade_criteria에서 동적 로딩인지
- PROMPT 62 변경(maxScore 6→100)이 이 함수 동작에 영향을 줬는지

**시뮬레이션 (분석 보고서에 표 형식으로 포함)**:
- 89.19점 → 현재 어떤 등급으로 판정되는가?
- 90.00점 → 현재 어떤 등급?
- 89.50점 → 어떤 등급?
- 100.00점 → 어떤 등급?
- 0.00점 → 어떤 등급?

### 2. codeToScore / buildGradeMap 현재 상태 + 사용처 전수

PROMPT 62에서 buildGradeMap의 maxScore를 6→100으로 변경했음. 그러나 codeToScore 자체가 어떻게 정의되어 있는지 사전 점검 필요.

- codeToScore의 정확한 정의 (전체 매핑 값 인용)
- 변환 방향: 등급→점수만? 또는 양방향?
- 사용처 전수 (server/index.js + scripts + public 전체):
  - 각 사용처의 line 번호
  - 그 사용처가 등급→점수 역매핑을 어떤 목적으로 쓰는지
  - PROMPT 62 변경(scoreToGrade 평균 경로 폐기)으로 사용처가 줄었는지

**중요 질문**: codeToScore가 더 이상 평균 계산에 쓰이지 않는다면, 다른 어떤 코드 경로에서 쓰이고 있는가? 모두 식별해야 PROMPT 63 본 작업에서 일관성 있게 정리 가능.

### 3. grade_criteria 현재 스키마 + 시드 데이터

- 테이블 정의 (Prisma schema 또는 CREATE TABLE 인용)
- 컬럼 목록 (id, grade_code, sort_order, is_active 외 추가 컬럼 유무)
- 시드 데이터 행 목록 (grade_code, sort_order 값 그대로)
- 마이그레이션 이력 (min_score 추가 시도 흔적이 있는지)

**cutoff 도입 시 필요한 컬럼 후보**:
- `min_score` (REAL/FLOAT, 0-100): 이 등급으로 판정되는 최소 점수
- `max_score` (REAL/FLOAT, NULL 가능): 최상위 등급은 NULL (100점까지)
- 또는 단일 `cutoff` (REAL) — 정렬 후 cutoff 이상이면 그 등급으로

분석 보고서에 "권장 컬럼 설계 1순위/2순위" 옵션 제시.

### 4. final_grade / selected_grade 산출 경로

DB 데이터 재산출 필요 여부 판단의 핵심.

- `final_grade` 컬럼: 어떤 시점에 어느 함수가 어떤 입력으로 산출하는가?
  - 시드 스크립트의 산출
  - 운영 시 자기평가/상사평가/2차평가 제출 라우터의 산출
  - PROMPT 61B의 재계산 스크립트 (`recalc-final-scores.js`)에서의 산출
- `selected_grade` 컬럼: 관리자 수동 선택 값? 또는 final_grade 자동 복사?
  - PROMPT 61B에서 "selected_grade는 NULL인 경우만 새 등급으로 채움 (관리자 수동 판단 보존)"으로 처리한 이력 인용

**재산출 영향 분석**:
- 현재 운영 DB의 final_evaluations 행 수 (대략 시드 64건 + α)
- final_score는 그대로 유지되고 final_grade만 새 cutoff로 재산출하면 끝나는지
- selected_grade는 관리자 수동 판단이므로 그대로 보존해야 하는지 (사용자 결정 필요)
- 분석 보고서에 시나리오별 영향 표 포함

### 5. 관리자 UI에서 등급 기준 편집 가능 범위

현재 `renderGradeCriteria` (또는 등급 관리 UI)가 편집 가능한 필드:
- grade_code 편집 가능?
- sort_order 편집 가능?
- is_active 토글 가능?
- 신규 등급 추가 가능?

cutoff 컬럼 추가 시 UI 추가 작업 범위:
- min_score 입력 필드
- 검증 로직 (인접 등급의 min_score보다 큰 값이어야 함, 0~100 범위 등)
- 활성 등급들의 cutoff 정렬 표시

PROMPT 60C의 평가 정책 탭 UX 패턴을 따를지, 별도 테이블 편집 UI일지 사전 점검.

### 6. codeToScore 역매핑을 cutoff와 어떻게 정합시킬지

가장 까다로운 부분. 현재:
- scoreToGrade(89.19) → EE (등급으로)
- codeToScore(EE) → ? (점수로 — 정수 5? 또는 cutoff의 min_score?)

이 두 함수가 정합되지 않으면 분석/통계에서 다시 왜곡이 생김.

**옵션 분석 (분석 보고서에 옵션별 장단점 정리)**:
- **옵션 A**: codeToScore를 폐기, 모든 평균/통계는 final_score로만 산출 (PROMPT 62의 연장)
- **옵션 B**: codeToScore를 cutoff의 min_score로 매핑 (대표값을 min_score로)
- **옵션 C**: codeToScore를 cutoff 구간의 중간값으로 매핑 (대표값을 (min+next_min)/2)
- **옵션 D**: codeToScore 보존하되 1-6 매핑 유지하고 점수→등급만 cutoff로

PROMPT 62 흐름상 옵션 A가 가장 일관성 있을 가능성 — 분석 보고서에서 권장 의견 명시 (단일 권장값, 사용자가 OK/수정만).

---

## 분석 보고 형식

분석 완료 후 다음 형식의 보고서를 사용자에게 제공:

```markdown
# 등급 경계 명시화 영향 분석 보고서 (2026-05-29, PROMPT 63-PRE)

## 1. scoreToGrade 현재 공식
- 위치: server/index.js line N~M
- 공식: [정확한 인용]
- 입력 스케일: [0-100 / 0-5 / 기타]
- 출력 등급: [고정 매핑 / grade_criteria 동적]
- PROMPT 62 영향: [있음/없음, 어떻게]

### 시뮬레이션
| 입력 점수 | 현재 등급 | 비고 |
|-----------|----------|------|
| 89.19 | EE | (89.19 × 5 / 100 + 1 = 5.46 → 반올림 5 → EE) ← 예시 |
| 90.00 | OI | |
| 89.50 | OI/EE | (경계값) |
| 100.00 | OI | |
| 0.00 | NC/D | |

## 2. codeToScore / buildGradeMap

### codeToScore 정의
- 위치: server/index.js line N~M
- 정의: [전체 매핑 값 인용]

### buildGradeMap 정의 (PROMPT 62 변경 후)
- 위치: server/index.js line N~M
- maxScore: 100 (PROMPT 62)
- 변경 이력: 6 → 100

### codeToScore 사용처 전수
| 파일 | line | 용도 | PROMPT 62 후 여전히 사용? |
|------|------|------|---------------------------|
| ... | ... | ... | ... |

## 3. grade_criteria 스키마

### 현재 정의
[CREATE TABLE 또는 Prisma schema 인용]

### 컬럼 목록
- id (INT PK)
- grade_code (TEXT) — 예: OI, EE, SC, IR, NC
- sort_order (INT) — 표시 순서
- is_active (BOOLEAN)
- [추가 컬럼 있으면 모두]

### 시드 데이터
| id | grade_code | sort_order | is_active |
|----|-----------|------------|-----------|
| ... | ... | ... | ... |

### 권장 컬럼 설계
- **권장 1순위**: min_score (REAL, NOT NULL, 0~100), 단일 cutoff
  - 장: 단순, 검증 쉬움, 정렬 명확
  - 단: 최상위 등급의 max 표현이 암묵적 (그 위 cutoff 없음 = 100점까지)
- **2순위**: min_score + max_score 둘 다
  - 장: 명시적
  - 단: 두 컬럼 일관성 검증 부담

## 4. final_grade / selected_grade 산출 경로

### final_grade 산출
- 시드 스크립트: scripts/seed-eval-data.js line N — scoreToGrade(final_score) 호출
- 자기평가 라우터: server/index.js line N — [있다면 인용, 없으면 N/A]
- 상사평가 라우터: server/index.js line N — calcFinalScore → scoreToGrade
- 2차 평가 라우터: server/index.js line N
- 재계산 스크립트: scripts/recalc-final-scores.js line N (PROMPT 61B)

### selected_grade 산출
- [관리자 수동 선택 / final_grade 자동 복사 / 둘 다] — 정확히 인용

### 재산출 영향
- 운영 DB final_evaluations 행 수: 약 [N]건 (시드 64건 + 신규 α)
- final_score 그대로 유지 + final_grade만 새 cutoff로 재산출 가능: [Y/N]
- selected_grade 보존 정책: [Y/N — 사용자 결정 필요]
- 재계산 스크립트 재사용 가능: [Y — PROMPT 61B의 recalc-final-scores.js에 cutoff 적용 추가만 / N — 신규 작성 필요]

## 5. 관리자 UI 편집 범위

### 현재 편집 가능 필드
- grade_code: [Y/N]
- sort_order: [Y/N]
- is_active: [Y/N]
- 신규 추가: [Y/N]
- 삭제: [Y/N]

### cutoff 추가 시 UI 작업
- min_score 입력 필드 추가 (예상 작업량: 소)
- 검증 로직: 인접 등급보다 작은/큰 값 등 (예상 작업량: 소)
- PROMPT 60C 패턴 적용 가능: [Y/N]

## 6. codeToScore 역매핑 정합 옵션

| 옵션 | 설명 | 장점 | 단점 | 권장 |
|------|------|------|------|------|
| A | codeToScore 폐기, 모든 평균은 final_score 직접 | PROMPT 62 연장, 가장 일관 | codeToScore 호출처 남아있으면 정리 필요 | ⭐ 권장 |
| B | codeToScore = cutoff min_score | 명시적 | 등급 내 분포 정보 손실 | |
| C | codeToScore = (min+next_min)/2 중간값 | 대표성 ↑ | 산출 복잡 | |
| D | 1-6 매핑 유지, 점수→등급만 cutoff | 변경 최소 | scoreToGrade와 codeToScore 비대칭 지속 | ❌ |

**권장**: 옵션 A — PROMPT 62의 "평균은 final_score 직접" 원칙과 정합. codeToScore 사용처가 PROMPT 62 후 충분히 줄었는지가 핵심. (사용처 전수 §2 표 참조)

## 7. PROMPT 63 본 작업 권장 범위

### 본 작업이 처리해야 하는 항목
- [ ] grade_criteria에 min_score 컬럼 추가 (마이그레이션)
- [ ] 시드 데이터에 min_score 값 입력 (예: OI=90, EE=70, SC=50, IR=30, NC=0)
- [ ] scoreToGrade 함수: 코드 공식 → DB cutoff 참조로 교체
- [ ] codeToScore 옵션 A 적용 (또는 사용자 결정 옵션)
- [ ] 관리자 UI에 min_score 편집 필드 추가 + 검증
- [ ] final_grade 일괄 재산출 (selected_grade는 보존)
- [ ] 검증 시나리오: 89.19 → OI, 89.99 → EE 또는 OI (경계값 동작), 관리자가 cutoff 변경 시 즉시 반영
- [ ] PROMPT 62 회귀: 조직 평균 표시는 그대로 89.19점 (변경 없음)

### 사용자 결정 필요 사항 (PROMPT 63 작성 전)
1. **등급 경계값 정책**: 현행 OI≥90/EE≥70/SC≥50/IR≥30/NC<30 유지? 또는 90/80/70/60/0 등분? 또는 커스텀?
2. **관리자 편집 가능 여부**: cutoff를 관리자가 편집할 수 있게 할지? (그렇다면 UI + 검증 + audit_log 필요)
3. **selected_grade 보존 정책**: 관리자가 수동 선택한 selected_grade는 final_grade 재산출 시에도 보존? (PROMPT 61B와 같은 방식)
4. **codeToScore 옵션**: A(폐기) / B(min_score) / C(중간값) / D(1-6 유지) 중 선택
5. **재계산 스크립트**: PROMPT 61B의 recalc-final-scores.js를 확장? 또는 신규 작성?

## 8. 위험도 평가
- 영향 범위: scoreToGrade 호출처 전수, final_grade 컬럼 전체 행
- 회귀 가능성: [높음/중간/낮음] — 사전 점검 결과에 따라
- 데이터 손실 위험: [있음/없음] — selected_grade 보존 정책에 따라
- PROMPT 62와 충돌 가능성: [없음 추정 — final_score 평균 경로는 건드리지 않음]

## 9. 권장 작업 순서 (PROMPT 63 작성 시)
1. DB 마이그레이션 (grade_criteria.min_score 추가)
2. 시드 데이터 cutoff 입력 (현행 매핑 보존 권장)
3. scoreToGrade 교체 (DB 참조)
4. codeToScore 옵션 적용 (사용자 선택)
5. 관리자 UI 편집 필드 추가 + 검증
6. final_grade 일괄 재산출 (selected_grade 보존)
7. 검증 시나리오 통과 확인
8. ClaudeHRM.md 설계 원칙 추가 (등급 cutoff DB화)
9. git commit + push (사용자 승인 후)
```

---

## 작업 절차

### 1. 사전 점검 grep 5회

위 6개 영역의 grep 명령을 실행. 미확정 사항이 있으면 추가 grep 최대 2회 허용. 결과를 채팅에 한 줄씩 보고:
- "scoreToGrade 위치: server/index.js line N"
- "codeToScore 위치 + 사용처 수: N곳"
- "grade_criteria 컬럼: id, grade_code, sort_order, is_active"
- 등

### 2. 6개 영역 분석

view_range로 함수 단위 읽기. 각 영역 분석 결과를 채팅에 간단히 보고.

### 3. 분석 보고서 작성

위 형식의 보고서를 채팅에 전체 출력. 시뮬레이션 표·사용처 표·옵션 표 모두 포함.

### 4. 사용자 결정 대기

§7의 "사용자 결정 필요 사항" 5개에 대해 사용자가 결정. 결정 결과를 받고 PROMPT 63 본 작업 진행 가능 안내.

---

## 작업 완료 체크리스트

- [ ] 사전 점검 grep 5회 이내, 6가지 확정 + 채팅 보고
- [ ] §1 scoreToGrade 분석 (공식 인용 + 시뮬레이션 5점)
- [ ] §2 codeToScore + 사용처 전수 분석
- [ ] §3 grade_criteria 스키마 + 시드 + 권장 컬럼 설계
- [ ] §4 final_grade/selected_grade 산출 경로 + 재산출 영향
- [ ] §5 관리자 UI 편집 범위
- [ ] §6 codeToScore 정합 옵션 분석 (A/B/C/D)
- [ ] §7 권장 작업 범위 + 사용자 결정 필요 사항 5개
- [ ] §8 위험도 평가
- [ ] §9 권장 작업 순서
- [ ] 사용자에게 보고서 제출 + 결정 대기

---

## 주의사항

- **코드 변경 절대 금지** — 본 PROMPT는 분석만
- **DB 마이그레이션 절대 금지** — 분석 단계에서는 grade_criteria 컬럼 추가하지 않음
- **시드 재실행 금지** — 분석 단계에서 데이터 건드리지 않음
- **모든 추정에 근거 명시** — 코드 인용 + line 번호 포함
- **불확실한 부분은 명시** — "추정", "확인 필요" 등 명확히 표시
- **PROMPT 62 회귀 우려 영역 명시** — 조직 평균 산출은 final_score 직접 평균이므로 본 작업과 무관하나, 만약 영향이 발견되면 보고서에 명시

### 코드 읽기 가이드 — 압축 방지 재강조
이번 분석은 SESSION_HANDOFF에서 "grade_criteria 압축 사고 교훈"으로 명시된 영역. 사전 점검 grep 결과로 line 번호 확정 후, view_range로 좁게만 읽을 것. 특히:
- server/index.js 전체 view 금지
- Prisma 어댑터 8개 일괄 view 금지
- public/js/pages/admin.js 전체 view 금지 — `renderGradeCriteria` 함수 영역만 view_range

---

## 다음 단계

PROMPT 63-PRE 분석 보고서 검토 후:
- 사용자가 §7의 5가지 결정 사항에 답변
- 답변 기반으로 **PROMPT 63 본 작업** 작성 (등급 cutoff DB화 + scoreToGrade 교체 + 관리자 UI + final_grade 재산출)
- PROMPT 63 본 작업은 위험도 중~높음 (DB 마이그레이션 + 운영 데이터 재산출) → 자동 푸시 ⚠️ 회색, 사용자 명시 승인 후 푸시

---

## 본 PROMPT 작성 시 적용된 원칙
- CLAUDE.md "PROMPT 작성 원칙" 3종 모두 적용 (코드 읽기 가이드 / 실행 트리거 / 컨텍스트 효율)
- SESSION_HANDOFF_2026-05-28.md의 "63-PRE 분석 항목 6개" 그대로 §1~§6에 대응
- 61-PRE 패턴 재사용 (분석만, 코드 변경 0)
- 분석 보고서 형식 사전 정의 — Claude Code가 채워야 할 표·인용·옵션을 명시적으로 지정
