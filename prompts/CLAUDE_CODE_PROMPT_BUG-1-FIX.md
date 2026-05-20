# CLAUDE_CODE_PROMPT_BUG-1-FIX.md

## 작업 개요

**문제**: BUG-1 작업으로 추가한 사이클 선택 드롭다운(`renderFinalSelfPicker`)이 화면에 표시되지 않음.

**원인**: picker를 `#fin-self` 컨테이너 내부에 부착했는데, 직후 호출되는 `renderFinalSelf(ev)` 함수가 마지막 입력 폼 분기에서 `el.innerHTML = ''`로 컨테이너를 초기화하여 picker가 삭제됨.

**해결**: picker를 `#fin-self` 내부가 아니라 **외부의 별도 컨테이너(`area`)에 부착**. 이렇게 하면 `renderFinalSelf`가 `#fin-self`를 비워도 picker는 무사함.

**파일**: `public/js/pages/final-eval.js` 단일 파일

**위험도**: 하 (클라이언트 단일 파일, 함수 2개 수정)

---

## 수정 내용

### 1) `Pages.finalEval` 함수 — picker 부착 위치 변경

**기존 (BUG-1 작업 결과)**:

```javascript
// 자기 최종평가 — 사이클 선택 드롭다운 + 기본 렌더
if (tabs.some(t => t.id === 'fin-self')) {
  renderFinalSelfPicker(myEvs, defaultEv);
}
```

**변경 후**:

```javascript
// 자기 최종평가 — 사이클 선택 드롭다운(area에 직접 부착) + 기본 렌더
if (tabs.some(t => t.id === 'fin-self')) {
  // 사이클이 2개 이상일 때만 picker를 tabs 위쪽에 부착
  if (myEvs.length > 1) {
    attachCyclePicker(area, tabsEl, myEvs, defaultEv);
  }
  renderFinalSelf(defaultEv);
}
```

**주의**: 위 수정은 picker를 `tabsEl` 바로 **앞**에 삽입하기 위한 것. `attachCyclePicker` 함수에서 `area.insertBefore(picker, tabsEl)`로 처리.

### 2) `renderFinalSelfPicker`, `bindCycleSelChange` 함수 — 전면 교체

기존 두 함수를 삭제하고 다음 한 함수로 교체:

```javascript
// 자기 최종평가 — 사이클 선택 드롭다운 (area에 부착, tabs 위쪽 배치)
function attachCyclePicker(area, tabsEl, myEvs, defaultEv) {
  const phaseLabel = (p) => ({
    'approved':            '목표 확정',
    'final_self':          '자기평가 진행 중',
    'final_mgr_pending':   '상사평가 대기',
    'final_mgr2_pending':  '2차 평가자 대기',
    'final_done':          '평가 완료',
  }[p] || p);

  const picker = document.createElement('div');
  picker.className = 'card';
  picker.id = 'fin-self-cycle-picker';
  picker.style.cssText = 'padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
  picker.innerHTML = `
    <label style="font-size:12px;color:var(--muted);font-weight:500">평가 사이클 선택</label>
    <select id="fin-self-cycle-sel"
      style="flex:1;min-width:200px;padding:6px 10px;border:1px solid var(--border);
             border-radius:6px;background:var(--white);font-size:13px;cursor:pointer">
      ${myEvs.map(e => `
        <option value="${e.id}" ${e.id === defaultEv.id ? 'selected' : ''}>
          ${e.eval_year || ''} ${e.period_label || ''} — ${phaseLabel(e.phase)}
        </option>`).join('')}
    </select>`;

  // tabs 바로 앞에 삽입 (즉 자기/상사 탭 위에 표시)
  area.insertBefore(picker, tabsEl);

  // 선택 변경 시 해당 사이클로 다시 렌더
  const sel = picker.querySelector('#fin-self-cycle-sel');
  sel.addEventListener('change', () => {
    const targetId = parseInt(sel.value);
    const target = myEvs.find(e => e.id === targetId);
    if (!target) return;
    // 자기 최종평가 탭으로 자동 전환
    switchFinTab('fin-self');
    // 해당 사이클로 재렌더 (#fin-self 내부만 갈아끼움, picker는 유지)
    renderFinalSelf(target);
  });
}
```

### 3) 정리 — 삭제할 함수

다음 두 함수는 더 이상 사용하지 않으므로 **완전히 삭제**:

```javascript
function renderFinalSelfPicker(myEvs, defaultEv) { ... }   // 삭제
function bindCycleSelChange(myEvs) { ... }                  // 삭제
```

---

## 작업 순서

1. `public/js/pages/final-eval.js` 열기
2. **`Pages.finalEval` 함수**에서 `renderFinalSelfPicker(myEvs, defaultEv);` 호출 부분을 위 (1)번 새 코드로 교체
3. `renderFinalSelfPicker`, `bindCycleSelChange` 두 함수 **완전히 삭제**
4. 그 자리에 (2)번의 `attachCyclePicker` 함수를 추가
5. 저장

---

## 동작 원리 (간단)

```
[BUG-1 기존 — 잘못된 구조]
#main-area
 ├─ stabs (자기/상사 탭 버튼)
 ├─ #fin-self
 │   ├─ picker        ← renderFinalSelf 호출 시 innerHTML=''로 삭제됨
 │   └─ 입력 폼
 └─ #fin-mgr

[수정 후 — 올바른 구조]
#main-area
 ├─ picker            ← #fin-self 외부에 있으므로 안전
 ├─ stabs
 ├─ #fin-self
 │   └─ 입력 폼
 └─ #fin-mgr
```

---

## 검증 절차

브라우저 Ctrl+F5 후:

### 시나리오 A — dev3
- `dev3@synapsoft.com / user1234`
- "내 평가" → 2분기 카드 "최종 평가 →"
- ✅ **자기/상사 탭 바로 위에** "평가 사이클 선택" 드롭다운 카드 표시
- ✅ 드롭다운 옵션 2개: `2025년 2025년 2분기 — 목표 확정`, `2025년 2025년 1분기 — 평가 완료`
- ✅ 기본 선택: 2분기 (진행 중 우선)
- ✅ 1분기로 변경 → 화면 본문이 완료 결과 카드로 갈아끼워짐 (드롭다운은 그대로 유지)
- ✅ 다시 2분기로 변경 → 입력 폼으로 복귀

### 시나리오 B — 단일 사이클
- 다른 단일 사이클 사용자(예: sales1)로 확인
- ✅ 드롭다운이 표시되지 않고 바로 평가 화면

### 시나리오 C — 콘솔 확인
```javascript
document.getElementById('fin-self-cycle-sel')   // HTMLSelectElement 반환되어야 함
```

---

## 콘솔 진단으로 확정된 사항

- `App.user.id === 6` (dev3)
- 화이트리스트 사이클 2개 정상 수집됨 (2분기 approved, 1분기 final_done)
- `renderFinalSelfPicker`는 정의되어 호출되었지만 `fin-self.innerHTML`이 직후 초기화되어 picker가 삭제됨
- 본 수정으로 picker를 `#fin-self` 외부에 부착하여 해결

---

## 커밋 메시지

```
fix: 사이클 선택 드롭다운 위치 수정 (#fin-self 외부로 이동) (BUG-1-FIX)
```

---

## 작업 완료 후

- ClaudeHRM.md "최근 개발 이력" 상단에 1줄 추가:
  ```
  | 2026-05-20 | 자기 최종평가 사이클 선택 드롭다운 표시 버그 수정 (picker를 외부로 이동) (BUG-1-FIX) | Claude Code |
  ```
