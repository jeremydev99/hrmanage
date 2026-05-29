# CLAUDE_CODE_PROMPT_63-UI — 내 평가 사이클 카드 진행 단계 표시 모바일 가로 오버플로 수정

## 실행 트리거

사용자가 "PROMPT 63-UI 진행해줘" 발언 시 본 PROMPT 시작.
완료 후 "PROMPT 63-UI 완료" 보고 + 검증 결과 요약.

---

## 작업 개요

**현상 (사용자 캡처, 2026-05-29)**:
- "내 평가" 메인 화면의 사이클 카드 안에 표시되는 **진행 단계 박스 5개** (목표작성 → 목표승인 → 중간피드백 → 최종평가 → 완료)가 모바일 화면 좌우 폭을 넘어감
- 캡처: 좌측 일부가 화면 밖으로 잘림, 우측은 "5 완료" 박스가 화면 밖으로 튀어나옴
- 사용자 환경: SKT 단말 모바일 (캡처 폭 약 720px CSS px 추정, ngrok-free.dev 도메인)

**원인 추정 (사전 점검에서 확정)**:
- 진행 단계 컨테이너가 `display: flex` + 각 단계 박스 고정폭(예: min-width 80~100px) + 연결선(spacer)
- 5개 박스 + 4개 연결선 = 합산 폭이 모바일 좁은 화면(예: 360px) 컨테이너를 초과
- `overflow-x: visible`(또는 auto이지만 의도와 다른 동작)로 캔버스 밖으로 튀어나옴

**목표**:
- **어느 모바일 폭에서도 컨테이너 안에 들어오게** (320px / 360px / 390px / 414px / 480px / 720px 등 다양한 단말)
- 진행 5단계 시각 표현은 유지 (체크/번호 + 라벨)
- PC·태블릿 화면의 기존 레이아웃은 회귀 없이 유지

**우선 적용 방안** (사전 점검 결과에 따라 조합):
1. **viewport 폭에 맞춰 단계 박스가 컴팩트해지는 반응형 레이아웃** (기본 권장)
   - 단계 박스의 min-width 제거, 라벨 글자 크기 축소, 연결선 폭 축소
   - 컨테이너에 `max-width: 100%` + `box-sizing: border-box`
   - 매우 좁은 화면(< 360px)에서는 라벨 줄바꿈 또는 짧은 라벨 사용
2. **세로 배치 fallback** (대안, 360px 이하 적용)
   - 가로로 도저히 안 들어오면 세로 stack (각 단계를 1줄씩)
3. **가로 스크롤 명시화** (최후 수단, 권장 안 함)
   - `overflow-x: auto` + `-webkit-overflow-scrolling: touch`
   - 단점: 사용자가 옆으로 스크롤해야 전체 단계 확인 가능

**권장: 1번 단독 적용** (단순, UX 최선). 1번으로 부족하면 1+2 조합. 3번은 회피.

## 작업 위험도: 낮음 (CSS·HTML 마크업 보정만, 로직 변경 없음)
## 자동 푸시 여부: ✅ 허용 (UI 보정만, 검증 통과 후 자동 푸시)

---

## 코드 읽기 가이드 (압축 방지)

본 작업은 다음 영역만 읽고 진행. **전체 파일 view 금지**, view_range 필수.

### 사전 점검 grep (3회, 위치 확정)

```bash
# 1) 내 평가 메인 페이지 진행 단계 렌더링 함수 — 추정 위치
findstr /n "목표작성\|목표승인\|중간피드백\|최종평가\|step-1\|step-2\|phase-step\|progress-step" public\js\pages\my-eval.js

# 2) 진행 단계 CSS 클래스 — step / phase / progress 패턴
findstr /s /n "phase-step\|progress-step\|step-bar\|eval-step\|cycle-step" public\css\

# 3) 폴백: app.js나 다른 페이지에도 같은 stepper가 있을 가능성
findstr /s /n "목표작성\|목표승인" public\js\pages\
```

**확정해야 할 4가지**:
1. 진행 단계 렌더링 함수 위치 (Pages.myEval 또는 별도 헬퍼)
2. 단계 박스 마크업 구조 (각 단계가 어떤 클래스로 감싸졌는지)
3. 현재 CSS의 단계 박스 width / min-width / flex 속성
4. 같은 stepper 컴포넌트가 다른 페이지에서도 쓰이는지 (전직원 평가 현황의 phase 배지 등)

### 확정 후 읽을 영역 (좁게)
- `public/js/pages/my-eval.js`: 진행 단계 렌더링 영역 (grep 확정 line ± 30줄)
- `public/css/style.css`: 진행 단계 CSS 정의 (grep 확정 line ± 30줄)
- 폴백 — `public/js/pages/admin.js`의 `renderPhaseBadge` 또는 유사 함수 (grep 결과에 따라)

**그 외 view 금지.** 전체 파일 view 금지, view_range 필수.

---

## 변경 사양

### 1. 진행 단계 컨테이너 CSS — 반응형 보강

진행 단계 컨테이너(예: `.phase-progress`, `.cycle-steps`, `.eval-stepper` — 사전 점검에서 확정한 클래스명)에 다음 속성 추가/보강:

```css
/* 진행 단계 컨테이너 (사전 점검 클래스명 사용) */
.eval-stepper {  /* 또는 확정된 실제 클래스명 */
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 4px;                  /* 모바일 좁은 화면 대비 작은 gap */
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 8px 4px;
  overflow: hidden;           /* 절대 캔버스 밖으로 튀어나오지 않게 */
}

/* 각 단계 박스 */
.eval-step {
  flex: 1 1 0;                /* 모든 단계가 균등 분할 */
  min-width: 0;               /* flex item이 컨테이너보다 커지지 않게 */
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
}

/* 단계 번호/체크 아이콘 */
.eval-step-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
}

/* 단계 라벨 */
.eval-step-label {
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;        /* 기본은 한 줄 유지 시도 */
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 단계 간 연결선 (spacer) */
.eval-step-divider {
  flex: 0 0 8px;              /* 좁은 폭 (4~12px 사이) */
  height: 1px;
  background: var(--o100);
  align-self: center;
  margin-top: 14px;           /* 아이콘 중앙선에 맞춤 */
}

/* 모바일 매우 좁은 화면 (< 380px) — 라벨 줄바꿈 허용 */
@media (max-width: 380px) {
  .eval-stepper {
    gap: 2px;
    padding: 6px 2px;
  }
  .eval-step-icon {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }
  .eval-step-label {
    font-size: 10px;
    white-space: normal;       /* 라벨 줄바꿈 허용 */
    word-break: keep-all;      /* 한글 단어 단위 줄바꿈 */
  }
  .eval-step-divider {
    flex-basis: 4px;
  }
}

/* PC·태블릿 (>= 768px) — 여유 있게 표시 */
@media (min-width: 768px) {
  .eval-stepper {
    gap: 8px;
  }
  .eval-step-icon {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }
  .eval-step-label {
    font-size: 12px;
  }
  .eval-step-divider {
    flex-basis: 20px;
  }
}
```

### 2. 마크업 검토 — flex가 적용되어 있는지 확인

사전 점검에서 확인한 마크업이 다음 패턴이면 CSS만으로 해결:

```html
<div class="eval-stepper">
  <div class="eval-step done">
    <div class="eval-step-icon">✓</div>
    <div class="eval-step-label">목표작성</div>
  </div>
  <div class="eval-step-divider"></div>
  <div class="eval-step done">...</div>
  ...
</div>
```

만약 현재 마크업이 인라인 스타일로 width를 박아놨거나 flex 컨테이너가 아니면, 마크업도 최소 수정 필요. **마크업 변경은 시각 회귀 최소화 방향으로** (클래스명 추가만, 기존 클래스 보존).

### 3. 컨테이너 부모 점검

진행 단계 컨테이너의 부모(사이클 카드 등)도 `box-sizing: border-box` + `max-width: 100%` + `overflow: hidden`이 적용되어 있는지 확인. 부모에서 가로 오버플로가 나는 경우라면 CSS 보강 위치가 다를 수 있음. **부모 → 컨테이너 → 자식 순으로 폭 제약 확인**.

### 4. 캔버스 자체의 가로 패딩 점검

`main-area`나 페이지 컨테이너의 가로 패딩이 모바일에서 과한지 점검 (예: padding-left/right: 20px이면 viewport 320px일 때 컨텐츠 영역이 280px만 남음). 필요 시 모바일에서 패딩 축소.

```css
@media (max-width: 480px) {
  #main-area {
    padding-left: 8px;
    padding-right: 8px;
  }
}
```

이건 사전 점검에서 main-area의 현재 패딩 확인 후 필요 시에만 적용.

---

## 작업 절차

1. **사전 점검 grep 3회** — 위 3개 grep 실행, 4가지 확정. 채팅에 한 줄씩 보고:
   - "진행 단계 함수: my-eval.js line N (renderXxx)"
   - "현재 컨테이너 클래스: .yyy"
   - "현재 박스 min-width: Npx"
   - "다른 페이지 공유 여부: Y/N (admin.js renderPhaseBadge 등)"

2. **CSS 보강** — 사전 점검에서 확정한 클래스명으로 위 §1 CSS 적용 (클래스명만 실제 값으로 치환)

3. **마크업 검토** — flex 컨테이너 + 자식 구조 확인. 필요 시 최소 수정

4. **부모/캔버스 점검** — 사이클 카드 부모와 main-area 가로 폭 제약 확인

5. **검증 시나리오 실행** (아래 6개 시나리오)

6. **회귀 확인** — PC·태블릿 화면에서 진행 단계 표시 정상 (PROMPT 62, 60E, 60B 등 회귀 없음)

7. **ClaudeHRM.md 개발 이력 1줄 추가**

8. **git commit + push** (UI 보정, 자동 푸시 허용)

9. **"PROMPT 63-UI 완료" 보고**

---

## 검증 시나리오

### 시나리오 1: 360px 모바일 (작은 단말)
- Chrome DevTools → 토글 디바이스 → "iPhone SE" 또는 "Galaxy S8" (360x640)
- 내 평가 진입
- ✅ 진행 5단계가 컨테이너 안에 모두 들어옴
- ✅ 좌우 어느 박스도 캔버스 밖으로 튀어나오지 않음
- ✅ 라벨이 줄바꿈되거나 ellipsis 처리되어도 5개 박스 모두 보임

### 시나리오 2: 414px 모바일 (큰 단말)
- DevTools → "iPhone 11 Pro Max" 또는 "Pixel 5"
- ✅ 라벨 한 줄 유지, 박스 간 여유 있음

### 시나리오 3: 720px (사용자 캡처 환경 추정)
- DevTools → 폭 720px 강제
- ✅ 진행 5단계 정상 표시, 캔버스 안

### 시나리오 4: 320px (극단적 좁음, iPhone SE 1세대)
- DevTools → 폭 320px 강제
- ✅ 5단계 컨테이너 안에 들어옴 (아이콘 + 짧은 라벨 또는 줄바꿈)
- ✅ 가로 스크롤바 발생하지 않음

### 시나리오 5: PC 데스크탑 (1280px+)
- 일반 PC 브라우저
- ✅ 기존 레이아웃 회귀 없음, 진행 단계 표시 정상

### 시나리오 6: 태블릿 (768~1024px)
- DevTools → "iPad" (768x1024)
- ✅ 박스 사이 여백 적절, 라벨 잘 보임

### 회귀 확인
- 전직원 평가 현황(admin.js renderPhaseBadge)의 phase 배지 표시 정상
- 사이클 카드 내 다른 요소(중간 보고 버튼, 중간 피드백 버튼, 최종 평가 버튼) 정상 표시
- PROMPT 62 조직 평균 표시 회귀 없음

---

## ClaudeHRM.md 갱신

개발 이력 1줄 추가 (최상단):
```
| 2026-05-29 | 내 평가 사이클 카드 진행 단계 표시 모바일 가로 오버플로 수정 (반응형 flex + 매우 좁은 화면 라벨 줄바꿈) (PROMPT 63-UI) | Claude Code |
```

UI 관련 설계 원칙이 이미 23번(UI 일관성)에 있으므로 별도 추가 원칙 없음. 단, 모바일 반응형 패턴이 향후에도 자주 쓰일 경우 별도 원칙 추가 검토.

---

## 작업 완료 체크리스트

- [ ] 사전 점검 grep 3회, 4가지 확정 + 채팅 보고
- [ ] §1 CSS 보강 (실제 클래스명으로 치환)
- [ ] §2 마크업 검토 (변경 필요 시 최소 수정)
- [ ] §3 부모 컨테이너 폭 제약 확인
- [ ] §4 캔버스 가로 패딩 점검 (필요 시 조정)
- [ ] 시나리오 1~6 통과 (DevTools 6개 폭)
- [ ] 회귀 확인 (전직원 평가 현황 phase 배지, 사이클 카드 다른 요소)
- [ ] ClaudeHRM.md 개발 이력 1줄 추가
- [ ] git commit + push
- [ ] "PROMPT 63-UI 완료" + 검증 결과 보고

---

## 주의사항

- **클래스명은 사전 점검 결과로 치환** — 본 PROMPT의 `.eval-stepper`, `.eval-step` 등은 예시. 실제 클래스명이 다르면 그것 사용.
- **마크업 변경 최소화** — CSS만으로 해결 가능하면 마크업 안 건드림. 시각 회귀 위험.
- **다른 페이지 공유 여부 확인** — 같은 stepper 컴포넌트가 다른 페이지에서도 쓰이면 그 페이지에서도 동작 검증.
- **PC 회귀 절대 금지** — 모바일 수정이 PC 화면 표시를 깨면 안 됨. media query로 분리 적용.
- **자동 푸시 허용** — UI 보정만, 위험 낮음. 검증 통과 후 자동 푸시.

### UI 일관성 원칙 적용 (CLAUDE.md 메타 원칙)
- 시스템 전반에 이미 사용 중인 색상·패턴 사용 (오렌지 #d97706 / var(--o500), 옅은 주황 그라데이션은 섹션 구분에만)
- 새 색상·스타일 발명 금지
- 사전 점검 단계에서 기존 CSS 패턴(`.btn`, `.bd`, `.card` 등) 확인 후 동일 패턴 적용

### 코드 읽기 가이드 — 압축 방지
- public/css/style.css 전체 view 금지 (꽤 큰 파일일 것)
- public/js/pages/my-eval.js 전체 view 금지
- view_range로 grep 확정 line ± 30줄만 읽기

---

## 다음 단계

PROMPT 63-UI 완료 후:
- PROMPT 63-PRE 분석 보고서 + 사용자 결정 5가지 답변 → PROMPT 63 본 작업 (등급 cutoff DB화)
- 또는 다른 모바일 반응형 이슈가 추가로 발견되면 PROMPT 63-UI2 등으로 분리 작성

---

## 본 PROMPT 작성 시 적용된 원칙
- CLAUDE.md "PROMPT 작성 원칙" 3종 모두 적용 (코드 읽기 가이드 / 실행 트리거 / 컨텍스트 효율)
- UI 일관성 원칙 (메타 원칙) — 기존 CSS 패턴 우선 적용
- 자동 푸시 허용 (UI 보정, 위험 낮음)
- 사전 점검 grep → view_range 좁게 → 변경 최소 → 6개 시나리오 검증 → 회귀 확인 순서
