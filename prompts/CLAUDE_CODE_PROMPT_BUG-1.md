# CLAUDE_CODE_PROMPT_BUG-1.md

## 작업 개요

**버그**: 자기 최종평가 화면 진입 시, 본인의 사이클이 여러 개일 때 `evs.find()`가 가장 최근 1개만 반환하므로 그 사이클이 화이트리스트 phase에 없으면 화면에 "목표가 확정된 평가가 없습니다"라는 메시지가 표시되어 다른 사이클(완료 건 포함)에 접근할 수 없음.

**해결**: 본인의 모든 화이트리스트 phase 사이클을 수집하고, 사용자가 드롭다운으로 선택할 수 있게 변경.

**파일**: `public/js/pages/final-eval.js`

**위험도**: 하 (클라이언트 단일 파일 수정, 서버/DB 무관)

---

## 수정 대상

### 1) `Pages.finalEval` 함수 — 전면 교체

기존 로직은 `evs.find()`로 단일 사이클만 잡음. 다음 로직으로 변경:

```javascript
Pages.finalEval = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';

  const evs = await API.get('/evals');

  // 본인의 사이클 중 최종평가 화면에서 다룰 수 있는 phase만 수집
  const ALLOWED_PHASES = ['approved','final_self','final_mgr_pending','final_mgr2_pending','final_done'];
  const myEvs = evs
    .filter(e => String(e.user_id) === String(App.user.id))
    .filter(e => ALLOWED_PHASES.includes(e.phase));
  // /evals는 이미 created_at DESC 정렬이지만 안전하게 한 번 더 정렬
  myEvs.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  // 기본 선택: 진행 중(final_done 이외) 우선, 없으면 가장 최근 완료
  const inProgress = myEvs.find(e => e.phase !== 'final_done');
  const defaultEv = inProgress || myEvs[0] || null;

  // 내가 직속 상사인 직원의 최종평가 대기 목록
  const mgrPending = await API.get('/evals/my-mgr-pending').catch(() => []);

  area.innerHTML = '';

  // 자기 최종평가 탭은 본인 사이클이 1개 이상이면 표시
  const tabs = [];
  if (defaultEv) tabs.push({ id: 'fin-self', label: '자기 최종평가' });
  if (mgrPending.length) tabs.push({ id: 'fin-mgr', label: `상사 최종평가 (${mgrPending.length}건)` });

  if (!tabs.length) {
    area.innerHTML = '<div class="card"><div class="alert alert-orange">목표가 확정된 평가가 없습니다.</div></div>';
    return;
  }

  const tabsEl = document.createElement('div');
  tabsEl.className = 'stabs';
  tabsEl.innerHTML = tabs.map((t, i) =>
    `<button class="stb${i===0?' active':''}" id="stb-${t.id}" onclick="switchFinTab('${t.id}')">${t.label}</button>`
  ).join('');
  area.appendChild(tabsEl);

  tabs.forEach((t, i) => {
    const sp = document.createElement('div');
    sp.className = 'sp' + (i===0 ? ' active' : '');
    sp.id = t.id;
    area.appendChild(sp);
  });

  // 자기 최종평가 — 사이클 선택 드롭다운 + 기본 렌더
  if (tabs.some(t => t.id === 'fin-self')) {
    renderFinalSelfPicker(myEvs, defaultEv);
  }
  if (tabs.some(t => t.id === 'fin-mgr')) {
    renderFinalMgr(mgrPending);
  }
};
```

### 2) `renderFinalSelfPicker` 함수 — 신규 추가

`renderFinalSelf(ev)` 함수 정의 직전(또는 직후 어디든 동일 스코프)에 다음 함수를 추가:

```javascript
// 자기 최종평가 — 사이클 선택 드롭다운 + 선택된 사이클 렌더
function renderFinalSelfPicker(myEvs, defaultEv) {
  const el = document.getElementById('fin-self');
  if (!el) return;
  el.innerHTML = '';

  // 사이클이 2개 이상일 때만 드롭다운 표시 (1개면 바로 렌더)
  if (myEvs.length > 1) {
    const phaseLabel = (p) => ({
      'approved':            '목표 확정',
      'final_self':          '자기평가 진행 중',
      'final_mgr_pending':   '상사평가 대기',
      'final_mgr2_pending':  '2차 평가자 대기',
      'final_done':          '평가 완료',
    }[p] || p);

    const picker = document.createElement('div');
    picker.className = 'card';
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
    el.appendChild(picker);

    // 선택 변경 시 해당 사이클로 재렌더
    const sel = picker.querySelector('#fin-self-cycle-sel');
    sel.addEventListener('change', () => {
      const targetId = parseInt(sel.value);
      const target = myEvs.find(e => e.id === targetId);
      if (!target) return;
      // 컨테이너 클리어 후 picker만 다시 그리고 본문 렌더
      el.innerHTML = '';
      el.appendChild(picker);
      // select 요소가 다시 붙은 후 값 유지
      picker.querySelector('#fin-self-cycle-sel').value = String(target.id);
      // 이벤트 다시 바인딩
      bindCycleSelChange(myEvs);
      renderFinalSelf(target);
    });
  }

  // 기본 사이클 렌더
  if (defaultEv) renderFinalSelf(defaultEv);
}

// 사이클 선택 드롭다운 change 이벤트 재바인딩 헬퍼
function bindCycleSelChange(myEvs) {
  const sel = document.getElementById('fin-self-cycle-sel');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const targetId = parseInt(sel.value);
    const target = myEvs.find(e => e.id === targetId);
    if (!target) return;
    const el = document.getElementById('fin-self');
    // picker 노드 보존하고 그 외만 제거
    const pickerCard = sel.closest('.card');
    el.innerHTML = '';
    el.appendChild(pickerCard);
    bindCycleSelChange(myEvs);
    renderFinalSelf(target);
  });
}
```

### 3) `renderFinalSelf(ev)` 함수 — 컨테이너 초기화 수정

기존 `renderFinalSelf` 함수 첫 줄 근처에서 `el.innerHTML = ''`로 전체 초기화하는 부분이 있다면 picker가 사라지지 않도록 변경해야 함.

기존 코드 검색:
```javascript
async function renderFinalSelf(ev) {
  const el = document.getElementById('fin-self'); if(!el) return;
  ...
```

이 함수는 내부에서 `el.innerHTML = ...`로 전체 덮어쓰는 분기가 있음:
- `if (ev.phase === 'final_done')` 분기: `el.innerHTML = ...` 사용
- `if (fe?.self_done)` 분기: `el.appendChild(selfCard)` 사용 — 누적 추가
- 마지막 입력 폼 분기: `el.innerHTML = ''` 후 `el.appendChild(card)` — 전체 클리어

이미 `renderFinalSelfPicker`와 `bindCycleSelChange`에서 호출 직전 picker를 다시 붙이므로 `renderFinalSelf` 자체는 **수정 불필요**. 다만 `if (fe?.self_done)` 분기는 `selfCard`를 누적 추가만 하므로 picker가 있으면 그 아래에 정상 렌더됨.

**중요**: `renderFinalSelf` 내부의 `el.innerHTML = '...'` 호출은 picker를 지우지만, picker는 `bindCycleSelChange`/`renderFinalSelfPicker`에서 호출 직전에 다시 부착하므로 OK.

단, `if (fe?.self_done)` 분기는 `el.innerHTML = ''`를 하지 않고 바로 `el.appendChild`하므로 picker가 누적 위에 그대로 남음 — 이게 정확한 의도임. 추가 수정 불필요.

확인 끝.

---

## 작업 순서

1. `public/js/pages/final-eval.js` 열기
2. `Pages.finalEval` 함수 전체를 위 (1)번 코드로 교체
3. `renderFinalSelf(ev)` 함수 정의 **바로 위**에 (2)번의 두 함수(`renderFinalSelfPicker`, `bindCycleSelChange`)를 추가
4. 저장
5. (서버 재시작 불필요 — 클라이언트만 수정)

---

## 검증 절차

브라우저에서 `http://localhost:3000` 접속 후:

### 시나리오 A — dev3 (한개발) 다중 사이클
- 로그인: `dev3@synapsoft.com / user1234`
- 상단 메뉴 → "내 평가" → 2025년 2분기 카드의 **"최종 평가 →"** 버튼 클릭
- ✅ "목표가 확정된 평가가 없습니다" 메시지가 **더 이상 표시되지 않음**
- ✅ 화면 상단에 "평가 사이클 선택" 드롭다운 표시
- ✅ 드롭다운에 **2025년 2분기 — 목표 확정**, **2025년 1분기 — 평가 완료** 두 항목 표시
- ✅ 기본 선택: 2025년 2분기 (진행 중 우선)
- ✅ 2분기 선택 시: 자기 최종평가 입력 폼 표시 (별점, 의견 textarea, 제출 버튼)
- ✅ 1분기로 선택 변경 시: 완료된 평가 결과 카드 표시 (최종 점수, 등급, 목표별 점수, 상사 의견)

### 시나리오 B — sales1 (오영업) 완료 데이터
- 로그인: `sales1@synapsoft.com / user1234`
- "내 평가" → "최종 평가 →"
- ✅ 2026년 상반기 사이클이 표시되고 완료 결과 카드 정상 노출 (66.7점 / IR 등급)

### 시나리오 C — 평가자 시점
- 로그인: `dev1@synapsoft.com / user1234` (dev3의 직속 상사)
- "최종 평가 →" 진입
- ✅ "상사 최종평가" 탭이 표시되거나 안 표시되는 것 모두 기존 동작과 동일
- ❗ **이번 버그 수정 범위 밖**: 완료된 dev3의 1분기 평가는 "내가 승인한 이력" 화면에서 별도로 조회 가능 (BUG-3로 분리 처리 예정)

### 시나리오 D — 회귀 방지
- 기존 단일 사이클 사용자(예: sales2)도 정상 동작 확인
- 사이클이 1개뿐이면 드롭다운이 표시되지 않고 바로 평가 화면이 나옴

---

## 커밋 메시지

```
fix: 자기 최종평가 화면 다중 사이클 지원 (find→filter+드롭다운) (BUG-1)
```

---

## 주의

- 서버 코드는 건드리지 않음. 서버는 이미 정상 동작 중 (PROMPT 44 검증 완료).
- Docker 재기동 불필요. 정적 파일이라 브라우저 새로고침(Ctrl+F5)만으로 반영.
- 한글 인코딩: VS Code에서 파일 인코딩이 UTF-8인지 확인 후 저장.

---

## 작업 완료 후

- ClaudeHRM.md "최근 개발 이력" 섹션 상단에 1줄 추가:
  ```
  | 2026-05-20 | 자기 최종평가 화면 다중 사이클 지원 (드롭다운 선택) (BUG-1) | Claude Code |
  ```
- ClaudeHRM.md "알려진 버그 및 미완성" 항목에서 BUG-1 관련 표기 제거 또는 처리 완료 표시
