# CLAUDE_CODE_PROMPT_BUG-2.md

## 작업 개요

**버그**: "내 승인 이력" 화면에서 자기평가 완료 여부를 `final_evaluations.self_done` 플래그만 보고 판단하는데, DB에 `self_done=0`이지만 `final_eval_scores.self_score`는 입력된 모순 데이터가 존재. 이로 인해 실제로는 자기평가가 완료됐는데 "자기평가 미완료"로 잘못 표시됨.

**현상**:
- 오영업 2026년 상반기: 자기점수 3건 입력 + 상사평가 완료(66.7점/IR) + 최종 잠금 상태인데 "자기평가 미완료" 배지 표시
- 정개발 2026년 상반기: 자기점수 4건 입력했는데 "자기평가 미완료" 배지 표시

**원인**:
- 데이터 생성 시점(2026-05-01, 2026-05-04)에 `POST /api/final/:evalId/self` 라우터가 `self_done=1`을 세팅하지 않았을 가능성 (현재 코드는 정상)
- 과거 force-phase 또는 다른 경로로 score만 들어왔을 가능성

**해결 방향**: 클라이언트 측 렌더링 로직을 `self_done` 플래그가 아니라 **실제 self_score 데이터 존재 여부**로 판단하도록 변경. DB 마이그레이션은 하지 않음(향후 동일 패턴 발생해도 안전하도록).

**파일**: `public/js/pages/approvals.js`

**위험도**: 하 (클라이언트 단일 파일, 표시 로직만 변경, 서버/DB 무관)

---

## 수정 내용

### 위치: `renderMyApprovalHistory` 함수 내부의 자기평가 배지 렌더링 부분

**기존 코드 (검색용 — 정확히 이대로 존재)**:

```javascript
            <span class="bd ${h.final_eval.self_done?'bd-approved':'bd-draft'}" style="font-size:11px">
              자기평가 ${h.final_eval.self_done?'완료':'미완료'}
            </span>
```

**변경 후**:

```javascript
            <span class="bd ${(h.final_eval.self_done || (h.final_eval.scores||[]).some(s => s.self_score != null && s.self_score > 0))?'bd-approved':'bd-draft'}" style="font-size:11px">
              자기평가 ${(h.final_eval.self_done || (h.final_eval.scores||[]).some(s => s.self_score != null && s.self_score > 0))?'완료':'미완료'}
            </span>
```

### 가독성 개선 — 변수 추출 (권장)

위 변경이 한 줄에 두 번 같은 표현식을 쓰므로 변수로 빼면 깔끔합니다. `history.forEach(h => {` 블록 안의 `card.innerHTML = ...` 직전에 다음 한 줄을 추가:

```javascript
    history.forEach(h => {
      // 자기평가 완료 판정: self_done 플래그 OR self_score 실제 입력
      const selfDone = h.final_eval
        ? (h.final_eval.self_done || (h.final_eval.scores||[]).some(s => s.self_score != null && s.self_score > 0))
        : false;
      const card = document.createElement('div');
      ...
```

그리고 배지 부분을 다음과 같이 변경:

```javascript
            <span class="bd ${selfDone?'bd-approved':'bd-draft'}" style="font-size:11px">
              자기평가 ${selfDone?'완료':'미완료'}
            </span>
```

**권장**: 변수 추출 방식이 가독성과 유지보수성에 좋습니다. 이 방식으로 진행하세요.

---

## 작업 순서

1. `public/js/pages/approvals.js` 열기
2. `renderMyApprovalHistory` 함수 내부의 `history.forEach(h => {` 직후, `const card = document.createElement('div');` 직전에 `selfDone` 변수 선언 추가
3. 같은 함수 내부의 자기평가 배지 부분에서 `h.final_eval.self_done` 두 번 등장을 `selfDone`으로 교체
4. 저장

---

## 검증 절차

브라우저 Ctrl+F5 후:

### 시나리오 A — ceo 승인 이력 확인
- 로그인: `ceo@synapsoft.com / admin1234`
- 상단 메뉴 → "관리자 설정" 또는 "승인" 진입 → "내 승인 이력" 탭 클릭
- ✅ **오영업 2026년 상반기**: "자기평가 완료" 배지 + "1차(이대표) 완료" 배지 + 66.7점/IR 표시
- ✅ **정개발 2026년 상반기**: "자기평가 완료" 배지 + "1차(...) 대기" 배지 (mgr_done=0이므로)
- ✅ **한개발 2025년 2분기**: 자기점수가 없으므로 "자기평가 미완료" 배지 (정상)

### 시나리오 B — 정상 데이터 회귀 확인
- 자기평가 신규 제출 후 화면에서도 "자기평가 완료"로 표시되는지 확인 (self_done=1 정상 경로)

### 시나리오 C — 콘솔 진단으로 확정
```javascript
const h5 = await API.get('/approvals/my-history');
h5.forEach(x => {
  const sd = x.final_eval
    ? (x.final_eval.self_done || (x.final_eval.scores||[]).some(s => s.self_score != null && s.self_score > 0))
    : false;
  console.log(`${x.target_name} ${x.period_label}: 자기평가 ${sd ? '완료' : '미완료'}`);
});
```

기대 출력:
```
한개발 2025년 2분기: 자기평가 미완료
오영업 2026년 상반기: 자기평가 완료
정개발 2026년 상반기: 자기평가 완료
```

---

## 적용 안 한 부분 (의도적)

- **DB 마이그레이션 안 함**: `UPDATE final_evaluations SET self_done=1 WHERE ...` 류의 일회성 패치는 하지 않음. 이유: 클라이언트 로직 변경만으로 표시는 정상화되고, 향후 같은 모순 데이터가 발생해도 안전.
- **서버 라우터 변경 안 함**: 현재 `POST /api/final/:evalId/self`는 self_done=1을 정상 세팅함. 과거 데이터에만 모순이 있고 신규 데이터는 정상.

---

## 커밋 메시지

```
fix: 자기평가 완료 표시를 self_score 존재 여부로 판단 (DB 모순 데이터 호환) (BUG-2)
```

---

## 작업 완료 후

- ClaudeHRM.md "최근 개발 이력" 상단에 1줄 추가:
  ```
  | 2026-05-20 | "내 승인 이력" 자기평가 완료 배지 표시 버그 수정 (score 기반 판정) (BUG-2) | Claude Code |
  ```
