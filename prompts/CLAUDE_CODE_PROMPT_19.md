# Claude Code 작업 지시서 19
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_19.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 목표: 최종평가 등급 선택 UI를 카드 표 형태로 변경

### 현재 방식
- `<select>` 드롭다운으로 등급 선택
- 선택 시 설명만 아래 표시

### 변경 후 방식
- 등급 목록을 카드 형태로 표시 (라디오 버튼 방식)
- 각 카드에 순위 / 등급코드 / 등급명칭 / 설명 / 비고 모두 표시
- 클릭 시 해당 카드가 선택(하이라이트)되는 방식
- 설명/비고는 2줄 이상 표시 가능

---

## 작업 1 — final-eval.js: 등급 선택 UI 교체

### renderFinalMgr 함수에서 bottomSection의 등급 선택 부분을 아래로 교체

기존 `<select>` 드롭다운 부분을 찾아서 아래 카드 방식으로 교체:

```javascript
${grades.length ? `
<div style="margin-top:12px">
  <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:8px">
    최종 등급 선택 <span style="color:var(--red)">*</span>
  </label>
  <div id="fin-grade-list-${ev.id}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
    ${grades.map((g, idx) => `
    <div class="fin-grade-card" id="fin-grade-card-${ev.id}-${g.grade_code}"
      data-eval="${ev.id}" data-code="${g.grade_code}"
      onclick="selectGradeCard('${ev.id}','${g.grade_code}')"
      style="border:2px solid var(--border);border-radius:8px;padding:10px 12px;
             cursor:pointer;transition:all .15s;background:var(--white)">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr>
          <td style="width:50px;color:var(--muted);font-size:11px;padding:2px 8px 2px 0;
                     white-space:nowrap;vertical-align:top">순위</td>
          <td style="color:var(--o800);font-weight:600;padding:2px 16px 2px 0;
                     white-space:nowrap;vertical-align:top">${g.sort_order || idx+1}</td>
          <td style="width:60px;color:var(--muted);font-size:11px;padding:2px 8px 2px 0;
                     white-space:nowrap;vertical-align:top">등급 코드</td>
          <td style="color:var(--o800);font-weight:700;padding:2px 16px 2px 0;
                     white-space:nowrap;vertical-align:top">${g.grade_code}</td>
          <td style="width:60px;color:var(--muted);font-size:11px;padding:2px 8px 2px 0;
                     white-space:nowrap;vertical-align:top">등급 명칭</td>
          <td style="color:var(--o800);font-weight:500;padding:2px 0;
                     vertical-align:top">${g.grade_name}</td>
        </tr>
        ${g.description ? `
        <tr>
          <td style="color:var(--muted);font-size:11px;padding:4px 8px 2px 0;
                     white-space:nowrap;vertical-align:top">설명</td>
          <td colspan="5" style="color:var(--o700);font-size:12px;padding:4px 0 2px 0;
                     line-height:1.6;white-space:pre-wrap;vertical-align:top">${g.description}</td>
        </tr>` : ''}
        ${g.note ? `
        <tr>
          <td style="color:var(--muted);font-size:11px;padding:4px 8px 2px 0;
                     white-space:nowrap;vertical-align:top">비고</td>
          <td colspan="5" style="color:var(--muted);font-size:12px;padding:4px 0 2px 0;
                     line-height:1.6;white-space:pre-wrap;vertical-align:top">${g.note}</td>
        </tr>` : ''}
      </table>
    </div>`).join('')}
  </div>
  <!-- 선택된 등급 코드를 hidden input으로 보관 -->
  <input type="hidden" id="fin-grade-sel-${ev.id}" value="">
</div>` : ''}
```

### selectGradeCard 함수 추가 (파일 끝에 추가)

```javascript
function selectGradeCard(evalId, gradeCode) {
  // 같은 eval의 모든 카드 초기화
  document.querySelectorAll(`[data-eval="${evalId}"].fin-grade-card`).forEach(card => {
    card.style.borderColor    = 'var(--border)';
    card.style.background     = 'var(--white)';
    card.style.boxShadow      = 'none';
  });
  // 선택된 카드 하이라이트
  const selected = document.getElementById(`fin-grade-card-${evalId}-${gradeCode}`);
  if (selected) {
    selected.style.borderColor = 'var(--o500)';
    selected.style.background  = 'var(--o50)';
    selected.style.boxShadow   = '0 0 0 3px rgba(240,120,32,.15)';
  }
  // hidden input에 값 저장
  const hiddenInput = document.getElementById('fin-grade-sel-' + evalId);
  if (hiddenInput) hiddenInput.value = gradeCode;
}
```

---

## 작업 2 — submitFinalMgr 함수에서 등급 값 수집 방식 유지

`document.getElementById('fin-grade-sel-' + evalId)?.value` 로
hidden input에서 값을 가져오므로 기존 로직 수정 불필요.

단, 검증 부분 확인:
```javascript
const selectedGrade = document.getElementById(`fin-grade-sel-${evalId}`)?.value || '';
if (!selectedGrade) {
  showAlert('최종 등급을 선택해주세요.', 'orange');
  return;
}
```
이 코드가 있는지 확인. 없으면 추가.

---

## 작업 3 — CSS 호버 효과 추가 (style.css)

`public/css/style.css` 파일 끝에 추가:

```css
/* 등급 선택 카드 호버 */
.fin-grade-card:hover {
  border-color: var(--o300) !important;
  background: var(--o50) !important;
}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 최종평가 등급선택 UI: select드롭다운→카드테이블 방식으로 변경 (순위/코드/명칭/설명/비고 표시) | Claude Code |
```

### 핵심 설계 원칙 수정 (15번):
```
- 최종평가 등급 선택: 카드 테이블 방식 (라디오 클릭)
  각 카드에 순위/등급코드/등급명칭/설명/비고 표시
  선택 시 오렌지 테두리 하이라이트
  hidden input(fin-grade-sel-${evalId})으로 값 보관
```
