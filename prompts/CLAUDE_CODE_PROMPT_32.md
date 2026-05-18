# Claude Code 작업 지시서 32
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_32.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]
[작업 완료 후 git push 하지 말 것]

---

## 작업 목표
1. OKR 기간 선택 (MBO와 일관되게)
2. 관리자 설정 저장하기 방식 변경
3. CLAUDE.md 분리 (ClaudeHRM.md + CLAUDE.md)

---

## 작업 1 — OKR 기간 선택

### 1-1. okr-eval.js: startNewOKR 함수에 기간 선택 UI 추가

startNewOKR 함수에서
periodLabel 파라미터가 없을 때
(OKR 현황 메뉴에서 직접 진입 시)
활성 기간 목록을 보여주고 선택하게 수정:

```javascript
function startNewOKR(periodLabel, evalYear) {
  // 기간이 전달된 경우 바로 폼 표시
  if (periodLabel && evalYear) {
    _currentPeriodLabel = periodLabel;
    _currentEvalYear = evalYear;
    renderOKRForm(periodLabel, evalYear);
    return;
  }

  // 기간이 없으면 활성 기간 선택 화면 표시
  API.get('/eval-periods/active').then(periods => {
    if (!periods || !periods.length) {
      showAlert('활성화된 평가 기간이 없습니다.', 'red');
      return;
    }

    // 활성 기간이 1개면 바로 폼으로
    if (periods.length === 1) {
      _currentPeriodLabel = periods[0].period_label;
      _currentEvalYear = periods[0].eval_year;
      renderOKRForm(periods[0].period_label, periods[0].eval_year);
      return;
    }

    // 여러 개면 선택 화면 표시
    const area = document.getElementById('main-area');
    area.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-header-t">🎯 OKR 작성 기간 선택</div>
          <div class="card-header-s">작성할 평가 기간을 선택하세요</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${periods.map(p => `
          <button class="btn btn-ghost"
            style="text-align:left;padding:14px 16px;border:1px solid var(--border);
                   border-radius:8px;font-size:14px"
            onclick="startNewOKR('${p.period_label}','${p.eval_year}')">
            <div style="font-weight:600;color:var(--o800)">${p.period_label}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">
              ${p.eval_year} · ${p.period_type === 'half' ? '반기' : '분기'}
            </div>
          </button>`).join('')}
      </div>
      <div class="abar" style="margin-top:12px">
        <button class="btn btn-ghost" onclick="Pages.okrDashboard()">취소</button>
      </div>`;
    area.appendChild(card);
  }).catch(() => showAlert('평가 기간을 불러올 수 없습니다.', 'red'));
}

// 기존 OKR 폼 렌더링을 별도 함수로 분리
function renderOKRForm(periodLabel, evalYear) {
  _okrObjCount = 0; _okrKRCount = {};
  const area = document.getElementById('main-area');
  area.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-header-t">🎯 OKR 작성 — ${periodLabel}</div>
        <div class="card-header-s">Objective(목표)와 Key Results(핵심 결과)를 설정하세요</div>
      </div>
    </div>
    <div class="alert alert-teal" style="font-size:12px;margin-bottom:14px">
      <strong>작성 가이드:</strong> Objective는 도전적이고 정성적인 목표,
      Key Result는 측정 가능한 수치로 작성하세요. KR 달성률 70%를 성공으로 봅니다.
    </div>
    <div id="okr-objectives-area"></div>
    <button class="btn btn-ghost"
      style="width:100%;margin-top:8px;border:1px dashed var(--o300)"
      onclick="addOKRObjective()">+ Objective 추가</button>
    <div class="abar" style="margin-top:16px">
      <button class="btn btn-ghost"
        onclick="Pages.okrEval('${periodLabel}','${evalYear}')">취소</button>
      <button class="btn btn-primary" onclick="submitOKR()">OKR 저장</button>
    </div>`;
  area.appendChild(card);
  addOKRObjective();
}
```

---

## 작업 2 — 관리자 설정 저장하기 방식 변경

### 대상 탭
```
목표 카테고리 (adm-categories)
평가 기간 관리 (adm-periods) - 새 기간 추가는 즉시 반영 유지
권한 관리 (adm-roles)
평가 정책 (adm-policy)
평가 등급 (adm-grades) - 새 등급 추가는 즉시 반영 유지
```

### 2-1. admin.js: 각 탭에 저장하기 버튼 추가

각 탭 렌더링 함수를 찾아서
변경사항이 있을 때 저장하기 버튼 색상 강조 + 탭 이동 시 경고:

```javascript
// 변경사항 추적
let _adminDirty = false;

function markDirty() {
  _adminDirty = true;
  // 저장하기 버튼 강조
  document.querySelectorAll('.adm-save-btn').forEach(btn => {
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-primary');
    btn.textContent = '💾 저장하기 (변경사항 있음)';
  });
}

function clearDirty() {
  _adminDirty = false;
  document.querySelectorAll('.adm-save-btn').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
    btn.textContent = '저장하기';
  });
}

// 탭 전환 시 경고
function switchTab(tab) {
  if (_adminDirty) {
    if (!confirm('저장하지 않은 변경사항이 있습니다. 계속하시겠습니까?')) return;
    clearDirty();
  }
  // 기존 switchTab 로직...
}
```

### 2-2. 각 탭 하단에 저장 버튼 추가

**평가 정책 탭 (renderAdmPolicy):**
```javascript
// 각 섹션 하단에 섹션별 저장 버튼
<button class="btn btn-ghost adm-save-btn btn-sm"
  onclick="savePolicySection('피드백정책')">저장하기</button>

// 탭 전체 하단에 모두 저장 버튼
<div style="display:flex;justify-content:flex-end;margin-top:20px;
            padding-top:16px;border-top:2px solid var(--o100)">
  <button class="btn btn-primary adm-save-btn"
    onclick="saveAllPolicy()">💾 모두 저장하기</button>
</div>
```

기존 즉시 반영 API 호출을 저장 버튼 클릭 시로 변경:
```javascript
// 기존: onclick="setFeedbackLimit(value)" → 즉시 API 호출
// 변경: value 변경 시 markDirty() 호출만, 저장 버튼 클릭 시 API 호출
```

**권한 관리 탭 (renderAdmRoles):**
```javascript
// 탭 하단에 저장 버튼
<div style="display:flex;justify-content:flex-end;margin-top:16px">
  <button class="btn btn-primary adm-save-btn"
    onclick="saveAllRoles()">💾 모두 저장하기</button>
</div>
```

**평가 등급 탭 (renderAdmGrades):**
```javascript
// 새 등급 추가: 즉시 반영 유지
// 등급 편집 후: 저장 버튼으로 일괄 저장
<div style="display:flex;justify-content:flex-end;margin-top:16px">
  <button class="btn btn-primary adm-save-btn"
    onclick="saveAllGrades()">💾 모두 저장하기</button>
</div>
```

**목표 카테고리 탭 (renderAdmCategories):**
```javascript
// 카테고리 편집 후 저장 버튼
<div style="display:flex;justify-content:flex-end;margin-top:16px">
  <button class="btn btn-primary adm-save-btn"
    onclick="saveAllCategories()">💾 모두 저장하기</button>
</div>
```

---

## 작업 3 — CLAUDE.md 분리

### 3-1. ClaudeHRM.md 생성

현재 CLAUDE.md에서 아래 내용을 ClaudeHRM.md로 이동:
- 전체 DB 스키마 (ERD)
- API 엔드포인트 전체 목록
- 개발 이력 전체
- 알려진 버그 목록
- 핵심 설계 원칙 전체
- 테스트 계정 정보
- 파일 구조 상세

### 3-2. CLAUDE.md 간결화 (50~80행)

CLAUDE.md는 Claude Code 세션 시작 시 자동 로드되는 가이드로만 유지:

```markdown
# CLAUDE.md — Claude Code 세션 가이드

## 프로젝트 개요
- 사이냅소프트 인사평가 시스템 (hrmanage)
- 위치: C:\claudeprojects\hrmanage\
- 실행: 실행.bat
- GitHub: https://github.com/jeremydev99/hrmanage

## 기술 스택
- Backend: Node.js + Express + SQLite (better-sqlite3)
- Frontend: Vanilla JS (SPA, 프레임워크 없음)
- 인증: JWT + AES-256-CBC 암호화

## 핵심 파일
- server/index.js: 서버 + API 전체
- public/js/app.js: 라우터 + Pages 객체
- public/js/pages/: 각 페이지 JS
- public/css/style.css: 전체 스타일
- data/hrmanage.db: SQLite DB

## 작업 전 필수 확인
1. 이 파일(CLAUDE.md) 읽기
2. ClaudeHRM.md 읽기 (상세 명세)
3. 수정할 파일 직접 열어서 현재 상태 확인
4. 작업 완료 후 CLAUDE.md + ClaudeHRM.md 업데이트

## 주요 설계 원칙
- 조직도 기반 승인 체계 (manager_id 재귀)
- 평가방식 3차원 매핑 (조직×기간×방식)
- 모든 민감 데이터 AES-256-CBC 암호화
- 감사 로그 자동 기록

## 현재 진행 상황
→ ClaudeHRM.md 참조

## 테스트 실행
```
cd C:\claudeprojects\hrmanage
node server/index.js
```

## 상세 정보
→ ClaudeHRM.md 에서 확인:
  - DB 스키마 전체
  - API 목록 전체
  - 개발 이력
  - 설계 원칙 상세
```

---

## 작업 완료 후 CLAUDE.md + ClaudeHRM.md 업데이트

### 개발 이력에 추가:
```
| 오늘날짜 | OKR 기간 선택 UI, 관리자 저장하기 방식 변경, CLAUDE.md 분리 | Claude Code |
```
