# Claude Code 작업 지시서 33
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_33.md

[CLAUDE.md와 ClaudeHRM.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md + ClaudeHRM.md 업데이트]
[작업 완료 후 git push 하지 말 것]

---

## 작업 목표
1. OKR 기간 선택 UI에 반기/분기 표시 추가
2. 관리자 평가 정책 탭 저장하기 방식 근본 수정

---

## 작업 1 — okr-eval.js: 기간 선택 버튼에 반기/분기 표시

startNewOKR 함수에서 기간 선택 화면의
버튼 텍스트를 아래로 수정:

```javascript
${periods.map(p => {
  const typeLabel = p.period_type === 'half' ? '반기' 
    : p.period_type === 'quarter' ? '분기' 
    : p.period_type || '';
  return `
  <button class="btn btn-ghost"
    style="text-align:left;padding:14px 16px;border:1px solid var(--border);
           border-radius:8px;font-size:14px"
    onclick="startNewOKR('${p.period_label}','${p.eval_year}')">
    <div style="font-weight:600;color:var(--o800)">${p.period_label}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:2px">
      ${p.eval_year} · ${typeLabel}
      ${p.eval_mode && p.eval_mode !== 'MBO'
        ? `<span class="bd bd-teal" style="font-size:10px;margin-left:4px">${p.eval_mode}</span>`
        : ''}
    </div>
  </button>`;
}).join('')}
```

---

## 작업 2 — admin.js: 평가 정책 탭 저장하기 근본 수정

### 2-1. 임시 상태 저장 객체 추가

renderAdmPolicy 함수 상단에:
```javascript
// 정책 임시 상태 저장
let _policyState = {};
let _policyDirty = false;
```

### 2-2. renderAdmPolicy 함수 전체 수정

현재 각 정책 항목의 버튼/토글 클릭 시
즉시 API를 호출하는 모든 부분을 찾아서
아래 방식으로 변경:

**변경 원칙:**
```
기존: onclick="setSomeSetting(value)" → 즉시 API 호출
변경: onclick="setPolicyState('key', value, this)" → 임시 저장만
```

**setPolicyState 함수 추가:**
```javascript
function setPolicyState(key, value, btn) {
  _policyState[key] = value;
  _policyDirty = true;

  // 버튼 UI 업데이트 (같은 그룹의 버튼들)
  if (btn) {
    const group = btn.closest('[data-policy-group]');
    if (group) {
      group.querySelectorAll('button').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-ghost');
      });
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-primary');
    }
  }

  // 저장 버튼 강조
  document.querySelectorAll('.policy-save-btn').forEach(b => {
    b.classList.remove('btn-ghost');
    b.classList.add('btn-primary');
    b.innerHTML = '💾 저장하기 <span style="font-size:11px">(변경사항 있음)</span>';
  });
}
```

### 2-3. 각 정책 항목 UI 수정

현재 정책 항목들을 찾아서
각 항목 우측에 data-policy-group 속성 추가:

**예시 — 피드백 횟수 제한:**
```javascript
<div class="policy-row">
  <div>
    <div style="font-size:14px;font-weight:500">피드백 횟수 제한</div>
    <div style="font-size:12px;color:var(--muted)">...</div>
  </div>
  <div data-policy-group="fb-limit" style="display:flex;gap:6px">
    ${[1,2,3,5,0].map(n => `
      <button class="btn btn-sm ${currentFbLimit===n?'btn-primary':'btn-ghost'}"
        onclick="setPolicyState('fb_limit', ${n}, this)">
        ${n===0?'무제한':n+'회'}
      </button>`).join('')}
  </div>
</div>
```

**예시 — 켜짐/끄기 토글:**
```javascript
<div class="policy-row">
  <div>
    <div style="font-size:14px;font-weight:500">승인자 승인 수정/취소 허용</div>
  </div>
  <div data-policy-group="approver-edit" style="display:flex;gap:6px">
    <button class="btn btn-sm ${currentVal?'btn-primary':'btn-ghost'}"
      onclick="setPolicyState('approver_edit', true, this)">켜짐</button>
    <button class="btn btn-sm ${!currentVal?'btn-primary':'btn-ghost'}"
      onclick="setPolicyState('approver_edit', false, this)">끄기</button>
  </div>
</div>
```

모든 정책 항목에 동일한 패턴 적용:
- history_visibility
- fb_limit  
- approver_edit
- second_final
- timezone
- session_policy
- dashboard_depth
- notice (공지사항은 textarea라 별도)

### 2-4. 저장 버튼 추가 (섹션별 + 전체)

각 섹션 하단:
```javascript
<div style="display:flex;justify-content:flex-end;margin-top:8px">
  <button class="btn btn-ghost btn-sm policy-save-btn"
    onclick="saveAllPolicy()">저장하기</button>
</div>
```

탭 전체 하단:
```javascript
<div style="display:flex;justify-content:flex-end;margin-top:20px;
            padding-top:16px;border-top:2px solid var(--o100)">
  <button class="btn btn-ghost policy-save-btn"
    style="min-width:160px"
    onclick="saveAllPolicy()">저장하기</button>
</div>
```

### 2-5. saveAllPolicy 함수 추가

```javascript
async function saveAllPolicy() {
  if (!_policyDirty || Object.keys(_policyState).length === 0) {
    showAlert('변경된 설정이 없습니다.', 'orange');
    return;
  }

  try {
    const promises = [];

    // 각 설정별 API 호출
    if ('fb_limit' in _policyState) {
      promises.push(API.post('/settings/feedback-limit',
        { limit: _policyState.fb_limit }));
    }
    if ('history_visibility' in _policyState) {
      promises.push(API.post('/settings/history-visibility',
        { visible: _policyState.history_visibility }));
    }
    if ('approver_edit' in _policyState) {
      promises.push(API.post('/settings/approver-edit',
        { allowed: _policyState.approver_edit }));
    }
    if ('second_final' in _policyState) {
      promises.push(API.post('/settings/second-final',
        { allowed: _policyState.second_final }));
    }
    if ('timezone' in _policyState) {
      promises.push(API.post('/settings/timezone',
        { timezone: _policyState.timezone }));
    }
    if ('session_policy' in _policyState) {
      promises.push(API.post('/settings/session-policy',
        _policyState.session_policy));
    }
    if ('dashboard_depth' in _policyState) {
      promises.push(API.post('/settings/dashboard-depth',
        { depth: _policyState.dashboard_depth }));
    }
    if ('eval_mode' in _policyState) {
      promises.push(API.post('/settings/eval-mode',
        { mode: _policyState.eval_mode }));
    }

    await Promise.all(promises);

    // 공지사항은 별도 처리 (textarea)
    const noticeText = document.getElementById('notice-textarea')?.value;
    if (noticeText !== undefined) {
      await API.post('/notice', { content: noticeText });
    }

    showAlert(`${Object.keys(_policyState).length}개 설정이 저장되었습니다.`, 'green');
    _policyState = {};
    _policyDirty = false;

    // 저장 버튼 원래대로
    document.querySelectorAll('.policy-save-btn').forEach(b => {
      b.classList.remove('btn-primary');
      b.classList.add('btn-ghost');
      b.innerHTML = '저장하기';
    });

    // 탭 재렌더링
    renderAdmPolicy();

  } catch(e) { showAlert(e.message, 'red'); }
}
```

### 2-6. 탭 전환 시 경고

switchTab 함수를 찾아서 상단에 추가:
```javascript
function switchTab(tab) {
  if (_policyDirty) {
    if (!confirm('저장하지 않은 변경사항이 있습니다.\n탭을 이동하면 변경사항이 사라집니다. 계속하시겠습니까?')) {
      return;
    }
    _policyState = {};
    _policyDirty = false;
  }
  // 기존 switchTab 로직 계속...
}
```

---

## 작업 완료 후 CLAUDE.md + ClaudeHRM.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | OKR 기간 선택 반기/분기 표시, 평가정책 저장하기 방식 근본 수정 (즉시반영→저장버튼) | Claude Code |
```

### 핵심 설계 원칙에 추가:
```
- 관리자 평가정책 저장 방식:
  변경 시: _policyState에 임시 저장 + 버튼 강조
  저장 버튼 클릭 시: 일괄 API 호출
  탭 이동 시: 미저장 경고
  섹션별 저장 + 전체 저장 모두 가능
```
