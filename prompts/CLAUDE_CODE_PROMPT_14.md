# Claude Code 작업 지시서 14
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 1 — 승인 이력 조회 안 되는 문제 수정 (approvals.js)

### 원인
switchApprTab 함수에서 'appr-hist' 탭 클릭 시 renderMyApprovalHistory()를
호출하지 않거나, 탭 전환 시 다른 탭의 active 클래스가 꼬이는 문제.

### switchApprTab 함수를 찾아서 아래로 교체:
```javascript
function switchApprTab(id) {
  document.querySelectorAll('#main-area .stb').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#main-area .sp').forEach(s => s.classList.remove('active'));
  document.getElementById('stb-' + id)?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
  if (id === 'appr-hist') renderMyApprovalHistory();
}
```

### renderMyApprovalHistory 함수에서 이력 카드에 목표별 내용 추가

현재 카드에는 대상자 이름, 기간, 날짜, 의견만 표시됨.
관련 목표와 승인 수준 정보도 표시하도록 개선.

renderMyApprovalHistory 함수의 카드 innerHTML을 아래로 교체:

```javascript
    history.forEach(h => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '10px';
      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:14px;font-weight:600">${h.target_name}
              <span style="font-size:12px;color:var(--muted);font-weight:400"> · ${h.target_dept||''} ${h.target_grade||''} ${h.target_title||''}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">
              ${h.period_label||''} · ${h.level}차 ${actionLabels[h.action]||h.action} · ${(h.created_at||'').slice(0,16).replace('T',' ')}
            </div>
          </div>
          <span class="bd ${actionCls[h.action]||'bd-draft'}">${h.level}차 ${actionLabels[h.action]||h.action}</span>
        </div>
        <div style="margin-bottom:${canEdit?'10px':'0'}">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px">승인 의견</div>
          ${canEdit
            ? `<textarea id="aphr-note-${h.id}" style="width:100%;min-height:60px;resize:vertical">${h.note||''}</textarea>`
            : `<div style="font-size:13px;padding:8px;background:var(--o50);border-radius:6px;min-height:36px">${h.note||'(의견 없음)'}</div>`}
        </div>
        ${canEdit ? `
        <div class="abar">
          <button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:5px 12px"
            onclick="cancelApproval(${h.id},'${h.target_name}',${h.level})">승인 취소</button>
          <button class="btn btn-ghost btn-sm"
            onclick="editApproval(${h.id})">의견 수정</button>
        </div>` : ''}`;
      el.appendChild(card);
    });
```

---

## 작업 2 — 자기평가 완료 후 재제출 불가 처리 (final-eval.js + server/index.js)

### 2-1. server/index.js — POST /api/final/:evalId/self 에 중복 제출 방지 추가

```javascript
// 기존 조건 뒤에 추가
if (!['approved','final_self'].includes(ev.phase)) return res.status(400).json({ error: '자기평가 불가 상태' });

// 추가: 이미 self_done=1이면 재제출 차단
const existFe = db.prepare('SELECT self_done FROM final_evaluations WHERE eval_id=?').get(ev.id);
if (existFe?.self_done === 1) return res.status(400).json({ error: '이미 제출된 자기평가는 수정할 수 없습니다.' });
```

### 2-2. final-eval.js — 자기평가 완료 화면에 내용 표시 개선

자기평가 완료(self_done=1) 시 현재는 "완료했습니다" 안내와 점수만 표시.
이것을 잠금 상태로 전체 내용 표시하도록 수정:

```javascript
  if (fe?.self_done) {
    const selfCard = document.createElement('div');
    selfCard.className = 'card';
    selfCard.innerHTML = `
      <div class="card-header">
        <div><div class="card-header-t">자기 최종평가</div>
        <div class="card-header-s">제출 완료 — 잠금 상태 (수정 불가)</div></div>
        <span class="bd bd-locked">🔒 제출 완료</span>
      </div>
      <div class="alert alert-teal" style="font-size:12px">자기 최종평가가 제출되었습니다. 상사 최종평가를 기다리는 중입니다.</div>
      ${App.categories.map(cat => {
        const cg = goals.filter(g => String(g.category_id) === String(cat.id));
        if (!cg.length) return '';
        return `<div style="margin-bottom:12px">
          <div class="cat-title" style="background:${cat.color};color:${cat.text_color};display:inline-block;margin-bottom:8px">${cat.name}</div>
          ${cg.map(g => {
            const sc = (fe.scores||[]).find(s => String(s.goal_id) === String(g.id));
            const score = sc?.self_score || 0;
            const stars = '★'.repeat(score) + '☆'.repeat(5-score);
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--o50);flex-wrap:wrap;gap:6px">
              <span style="font-size:13px;font-weight:500">${g.name} <span style="font-size:11px;color:var(--muted)">${g.weight}%</span></span>
              <span style="color:var(--o500);font-size:15px">${stars} <span style="font-size:13px;font-weight:600">${score}점</span></span>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
      ${fe.self_note ? `
      <div style="margin-top:12px;padding:10px;background:var(--o50);border-radius:8px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:5px">자기 최종 의견</div>
        <div style="font-size:13px;line-height:1.7;white-space:pre-wrap">${fe.self_note}</div>
      </div>` : ''}`;
    el.appendChild(selfCard);
    return;
  }
```

---

## 작업 3 — 승인 이력에서 최종평가 내용 열람 (approvals.js + server)

### 3-1. server/index.js — /api/approvals/my-history에 최종평가 정보 포함

```javascript
// 기존 rows 생성 후 각 row에 최종평가 정보 추가
const enriched = rows.map(r => {
  // 해당 eval의 최종평가 조회
  const fe = db.prepare('SELECT * FROM final_evaluations WHERE eval_id=?').get(r.eval_id);
  const goals = db.prepare(
    `SELECT g.*, c.name as cat_name, c.color, c.text_color
     FROM goals g JOIN goal_categories c ON g.category_id=c.id
     WHERE g.eval_id=? ORDER BY c.sort_order, g.sort_order`
  ).all(r.eval_id).map(g => ({
    ...g,
    name: g.name ? decrypt(g.name) : '',
    kpi:  g.kpi  ? decrypt(g.kpi)  : '',
  }));
  let finalData = null;
  if (fe) {
    const scores = db.prepare('SELECT * FROM final_eval_scores WHERE final_id=?').all(fe.id);
    finalData = {
      self_done:   fe.self_done,
      mgr_done:    fe.mgr_done,
      final_score: fe.final_score,
      final_grade: fe.final_grade,
      mgr_note:    fe.mgr_note && fe.mgr_done ? decrypt(fe.mgr_note) : null,
      scores,
    };
  }
  return { ...r, goals, final_eval: finalData };
});
res.json(enriched);
```

기존 `res.json(rows)` 를 위 코드로 교체.

### 3-2. approvals.js — 이력 카드에 최종평가 결과 표시

renderMyApprovalHistory 함수의 카드에 최종평가 섹션 추가:

```javascript
// 카드 innerHTML 끝부분에 추가
${h.final_eval && (h.final_eval.mgr_done || h.final_eval.self_done) ? `
<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--o100)">
  <div style="font-size:12px;color:var(--muted);margin-bottom:6px">최종평가 현황</div>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
    <span class="bd ${h.final_eval.self_done?'bd-approved':'bd-draft'}" style="font-size:11px">자기평가 ${h.final_eval.self_done?'완료':'미완료'}</span>
    <span class="bd ${h.final_eval.mgr_done?'bd-locked':'bd-pending'}" style="font-size:11px">상사평가 ${h.final_eval.mgr_done?'완료':'대기'}</span>
    ${h.final_eval.final_score!=null?`<span style="font-size:14px;font-weight:700;color:var(--o500)">${h.final_eval.final_score}점</span><span class="bd bd-locked">${h.final_eval.final_grade}</span>`:''}
  </div>
  ${h.final_eval.scores?.length && (h.goals||[]).length ? `
  <div style="font-size:12px">
    ${(h.goals||[]).map(g => {
      const sc = h.final_eval.scores.find(s=>String(s.goal_id)===String(g.id));
      const ms = sc?.mgr_score||0;
      const ss = sc?.self_score||0;
      return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--o50)">
        <span style="flex:1;font-weight:500">${g.name}</span>
        ${ss?`<span style="color:var(--muted)">자기: ${'★'.repeat(ss)}${'☆'.repeat(5-ss)}</span>`:''}
        ${ms?`<span style="color:var(--o500)">상사: ${'★'.repeat(ms)}${'☆'.repeat(5-ms)}</span>`:''}
      </div>`;
    }).join('')}
  </div>` : ''}
  ${h.final_eval.mgr_note?`<div style="font-size:12px;margin-top:6px;padding:6px 8px;background:var(--o50);border-radius:6px">${h.final_eval.mgr_note}</div>`:''}
</div>` : ''}
```

---

## 작업 4 — 계정 가입 신청 미승인 계정 조직 지정 비활성화 (admin.js)

### renderAdmAccounts 함수에서 가입 신청 대기 카드의 조직 지정 폼 수정

승인 시 설정 폼(부서, 직급, 직책, 상위관리자, 권한 입력칸)에
`disabled` 속성 추가:

```javascript
// 가입 신청 대기 카드에서 승인 시 설정 폼 부분
// 기존: <input id="ap-dept-${u.id}" ...>
// 수정: <input id="ap-dept-${u.id}" ... disabled style="opacity:.5;cursor:not-allowed">
// 그리고 승인 버튼 클릭 시 활성화되는 방식으로 변경

// 승인 버튼 클릭 → 입력칸 활성화 → 재클릭하면 실제 승인
```

더 간단한 방식: 승인 버튼을 2단계로 변경:

```javascript
// 1단계 버튼: "승인 설정" — 클릭 시 입력칸 활성화
// 2단계 버튼: "승인 완료" — 실제 승인 처리

// 카드 하단 버튼 부분을 아래로 교체:
`<div class="abar">
  <button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D"
    onclick="rejectAccount('${u.id}')">거절</button>
  <button class="btn btn-ghost btn-sm" id="setup-btn-${u.id}"
    onclick="enableApproveForm('${u.id}')">⚙ 조직 설정</button>
  <button class="btn btn-success btn-sm" id="approve-btn-${u.id}" disabled style="opacity:.5"
    onclick="approveAccount('${u.id}')">✓ 승인</button>
</div>`

// 모든 입력 필드에 disabled 추가 (초기 상태):
// id="ap-dept-${u.id}" disabled
// id="ap-title-${u.id}" disabled
// id="ap-grade-${u.id}" disabled
// id="ap-mgr-${u.id}" disabled
// id="ap-role-${u.id}" disabled
```

enableApproveForm 함수 추가:
```javascript
function enableApproveForm(uid) {
  ['ap-dept-','ap-grade-','ap-title-','ap-mgr-','ap-role-'].forEach(prefix => {
    const el = document.getElementById(prefix + uid);
    if (el) el.disabled = false;
  });
  const setupBtn  = document.getElementById('setup-btn-'  + uid);
  const approveBtn = document.getElementById('approve-btn-' + uid);
  if (setupBtn)   setupBtn.style.display  = 'none';
  if (approveBtn) { approveBtn.disabled = false; approveBtn.style.opacity = '1'; }
}
```

---

## 작업 5 — 중간 보고에 목표별 작성란 추가 (progress-report.js)

### renderMyReports 함수에서 각 eval 카드의 새 보고 작성 폼 개선

기존 textarea 1개(자유양식) → 목표별 입력란 + 종합 의견란으로 변경:

```javascript
// 기존 새 보고 작성 폼 부분을 아래로 교체:
const formDiv = document.createElement('div');
formDiv.style.cssText = 'border-top:1px solid var(--o100);padding-top:14px;margin-top:4px';
formDiv.innerHTML = `<div style="font-size:13px;font-weight:500;color:var(--o800);margin-bottom:10px">
  ${reports.length ? '추가 중간 보고 작성' : '중간 보고 작성'}
</div>`;

// 목표별 입력란
if (goals && goals.length) {
  const goalsDiv = document.createElement('div');
  goalsDiv.style.marginBottom = '12px';
  goalsDiv.innerHTML = `<div style="font-size:12px;font-weight:500;color:var(--o600);margin-bottom:8px">목표별 진행 현황</div>`;
  goals.forEach(g => {
    const row = document.createElement('div');
    row.style.marginBottom = '8px';
    row.innerHTML = `
      <label style="font-size:12px;font-weight:500;color:var(--o800);display:block;margin-bottom:3px">
        ${g.name} <span style="font-size:11px;color:var(--muted)">(${g.weight}%)</span>
      </label>
      <textarea id="rpt-goal-${ev.id}-${g.id}"
        placeholder="${g.name}에 대한 진행 상황을 작성하세요..."
        style="width:100%;min-height:60px;resize:vertical"></textarea>`;
    goalsDiv.appendChild(row);
  });
  formDiv.appendChild(goalsDiv);
}

// 종합 의견
const overallDiv = document.createElement('div');
overallDiv.innerHTML = `
  <label style="font-size:12px;font-weight:500;color:var(--o600);display:block;margin-bottom:3px">중간보고 종합의견</label>
  <textarea id="rpt-content-${ev.id}"
    placeholder="전체적인 진행 상황, 이슈, 지원 요청 사항 등을 자유롭게 작성하세요..."
    style="width:100%;min-height:100px;resize:vertical"></textarea>`;
formDiv.appendChild(overallDiv);

// 파일 첨부 위젯
const fileWrap = document.createElement('div');
fileWrap.id = 'rpt-file-wrap-' + ev.id;
fileWrap.style.margin = '8px 0';
fileWrap.appendChild(createFileWidget('rpt-' + ev.id));
formDiv.appendChild(fileWrap);

// 제출 버튼
const abar = document.createElement('div');
abar.className = 'abar';
abar.style.marginTop = '10px';
const submitBtn = document.createElement('button');
submitBtn.className = 'btn btn-teal';
submitBtn.textContent = '보고 제출';
submitBtn.onclick = () => submitReport(ev.id, goals);
abar.appendChild(submitBtn);
formDiv.appendChild(abar);
card.appendChild(formDiv);
```

### submitReport 함수 시그니처 및 내용 변경

```javascript
async function submitReport(evalId, goals) {
  const overall = document.getElementById('rpt-content-' + evalId)?.value?.trim() || '';

  // 목표별 내용 수집
  const goalContents = (goals||[]).map(g => {
    const val = document.getElementById(`rpt-goal-${evalId}-${g.id}`)?.value?.trim() || '';
    return val ? `[${g.name}]\n${val}` : '';
  }).filter(Boolean);

  // 전체 content 구성 (목표별 + 종합)
  const parts = [];
  if (goalContents.length) parts.push(goalContents.join('\n\n'));
  if (overall) parts.push(`[종합의견]\n${overall}`);
  const content = parts.join('\n\n');

  const fileWidget = document.getElementById('rpt-file-wrap-' + evalId)?.querySelector('div._fw');
  const files = fileWidget?._files || [];

  if (!content && !files.length) {
    showAlert('보고 내용을 입력하거나 파일을 첨부해주세요.', 'orange');
    return;
  }
  try {
    await API.post('/reports/' + evalId, { content, files });
    showAlert('중간 보고가 제출되었습니다!', 'teal');
    setTimeout(() => Pages.progressReport(), 600);
  } catch(e) {
    showAlert(e.message, 'red');
  }
}
```

goals 로드를 renderMyReports 함수에서 추가:
```javascript
// 기존: const reports = await API.get('/reports/' + ev.id).catch(() => []);
// 수정:
const [reports, goals] = await Promise.all([
  API.get('/reports/' + ev.id).catch(() => []),
  API.get('/evals/' + ev.id + '/goals').catch(() => []),
]);
```

---

## 작업 6 — 등급 기준 삭제 수정 + 순위 열 추가 (admin.js + server/index.js)

### 6-1. server/index.js — DELETE /api/grade-criteria/:id 수정

현재 soft delete(is_active=0)로 되어 있어서 GET에서 is_active=1만 가져오므로
화면에서 사라지지 않는 것처럼 보임.

DELETE 라우트를 hard delete로 변경:
```javascript
app.delete('/api/grade-criteria/:id', auth, adminOnly, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM grade_criteria').get()?.c || 0;
    if (total <= 2) return res.status(400).json({ error: '최소 2개 이상의 등급이 필요합니다.' });
    db.prepare('DELETE FROM grade_criteria WHERE id=?').run(req.params.id);
    // 남은 등급 sort_order 재정렬
    const remaining = db.prepare('SELECT id FROM grade_criteria ORDER BY sort_order').all();
    remaining.forEach((r, i) => {
      db.prepare('UPDATE grade_criteria SET sort_order=? WHERE id=?').run(i+1, r.id);
    });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 6-2. grade_criteria 테이블에 sort_order 이미 있으므로 활용

PUT /api/grade-criteria/:id 에 sort_order 수정 포함:
```javascript
// 기존 PUT 라우트에 sort_order 추가
const { grade_code, grade_name, description, note, sort_order, is_active } = req.body;
db.prepare(
  'UPDATE grade_criteria SET grade_code=?,grade_name=?,description=?,note=?,sort_order=COALESCE(?,sort_order),is_active=? WHERE id=?'
).run(grade_code, grade_name, description||'', note||'', sort_order||null, is_active??1, req.params.id);
```

### 6-3. admin.js — renderAdmGrades 함수에 순위 열 추가

renderAdmGrades 함수의 테이블을 아래로 교체:

```javascript
    el.innerHTML = `<div class="card">
      <div class="card-header"><div>
        <div class="card-header-t">최종평가 등급 기준 관리</div>
        <div class="card-header-s">최소 2개 이상 · 순위 숫자가 작을수록 높은 등급 · 최종평가 시 이 기준에서 선택</div>
      </div></div>

      <table class="tbl" style="margin-bottom:16px">
        <thead><tr>
          <th style="width:60px;text-align:center">순위</th>
          <th style="width:110px">등급 코드</th>
          <th>등급 명칭</th>
          <th>설명</th>
          <th style="width:90px">비고</th>
          <th style="width:90px"></th>
        </tr></thead>
        <tbody>
          ${grades.map((g, idx) => `<tr>
            <td style="text-align:center">
              <input id="gc-sort-${g.id}" type="number" value="${g.sort_order||idx+1}"
                style="width:50px;text-align:center;font-size:12px;height:28px">
            </td>
            <td><input id="gc-code-${g.id}" value="${g.grade_code}" style="width:100%;font-size:12px;height:28px"></td>
            <td><input id="gc-name-${g.id}" value="${g.grade_name}" style="width:100%;font-size:12px;height:28px"></td>
            <td><input id="gc-desc-${g.id}" value="${g.description||''}" style="width:100%;font-size:12px;height:28px" placeholder="등급 설명"></td>
            <td><input id="gc-note-${g.id}" value="${g.note||''}" style="width:100%;font-size:12px;height:28px" placeholder="비고"></td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="saveGrade(${g.id})">저장</button>
                <button class="btn btn-sm" style="background:none;border:1px solid #F09595;color:#A32D2D;padding:3px 6px;font-size:11px" onclick="deleteGrade(${g.id})">삭제</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>

      <!-- 새 등급 추가 -->
      <div style="background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:14px">
        <div style="font-size:13px;font-weight:500;margin-bottom:10px;color:var(--o800)">새 등급 추가</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:0 0 60px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">순위</label>
            <input id="new-gc-sort" type="number" value="${grades.length+1}" style="width:100%;height:34px;font-size:13px;text-align:center">
          </div>
          <div style="flex:0 0 100px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">등급 코드</label>
            <input id="new-gc-code" placeholder="예: OI" style="width:100%;height:34px;font-size:13px">
          </div>
          <div style="flex:2;min-width:140px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">등급 명칭</label>
            <input id="new-gc-name" placeholder="등급 명칭" style="width:100%;height:34px;font-size:13px">
          </div>
          <div style="flex:3;min-width:180px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">설명</label>
            <input id="new-gc-desc" placeholder="등급 설명" style="width:100%;height:34px;font-size:13px">
          </div>
          <div style="flex:1;min-width:80px">
            <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">비고</label>
            <input id="new-gc-note" placeholder="비고" style="width:100%;height:34px;font-size:13px">
          </div>
          <button class="btn btn-primary" style="height:34px" onclick="addGrade()">+ 추가</button>
        </div>
      </div>
    </div>`;
```

saveGrade 함수에 sort_order 포함:
```javascript
async function saveGrade(id) {
  try {
    await API.put('/grade-criteria/' + id, {
      grade_code:  document.getElementById('gc-code-'+id)?.value.trim(),
      grade_name:  document.getElementById('gc-name-'+id)?.value.trim(),
      description: document.getElementById('gc-desc-'+id)?.value.trim(),
      note:        document.getElementById('gc-note-'+id)?.value.trim(),
      sort_order:  parseInt(document.getElementById('gc-sort-'+id)?.value||'0'),
      is_active: 1,
    });
    showAlert('저장되었습니다.', 'green');
    renderAdmGrades(); // 순위 변경 후 재정렬
  } catch(e) { showAlert(e.message, 'red'); }
}
```

addGrade 함수에 sort_order 포함:
```javascript
async function addGrade() {
  try {
    const sortVal = parseInt(document.getElementById('new-gc-sort')?.value || '999');
    await API.post('/grade-criteria', {
      grade_code:  document.getElementById('new-gc-code')?.value.trim(),
      grade_name:  document.getElementById('new-gc-name')?.value.trim(),
      description: document.getElementById('new-gc-desc')?.value.trim(),
      note:        document.getElementById('new-gc-note')?.value.trim(),
      sort_order:  sortVal,
    });
    showAlert('새 등급이 추가되었습니다.', 'green');
    renderAdmGrades();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

POST /api/grade-criteria 서버에도 sort_order 받도록:
```javascript
const { grade_code, grade_name, description, note, sort_order } = req.body;
// sort_order가 있으면 그 값 사용, 없으면 마지막+1
const finalSort = sort_order || ((db.prepare('SELECT MAX(sort_order) as m FROM grade_criteria').get()?.m||0) + 1);
const r = db.prepare(
  'INSERT INTO grade_criteria(grade_code,grade_name,description,note,sort_order) VALUES(?,?,?,?,?)'
).run(grade_code, grade_name, description||'', note||'', finalSort);
```

---

## 작업 7 — 상사 최종평가에 등급 선택 추가 (final-eval.js)

### renderFinalMgr 함수에서 grades 로드 및 등급 선택 UI 추가

```javascript
// Promise.all에 grades 추가
const [goals, fe, fbs, grades] = await Promise.all([
  API.get(`/evals/${ev.id}/goals`),
  API.get(`/final/${ev.id}`),
  API.get(`/feedback/${ev.id}`),
  API.get('/grade-criteria'),
]);
```

bottomSection.innerHTML 교체:
```javascript
bottomSection.innerHTML = `
  ${!ev.is_second && grades.length ? `
  <div style="margin-top:12px">
    <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">
      최종 등급 선택 <span style="color:var(--red)">*</span>
    </label>
    <select id="fin-grade-sel-${ev.id}" style="width:100%;height:38px;font-size:13px;margin-bottom:6px">
      <option value="">— 등급을 선택하세요 —</option>
      ${grades.map(g => `<option value="${g.grade_code}">${g.grade_name}${g.note?' ('+g.note+')':''}</option>`).join('')}
    </select>
    <div id="fin-grade-desc-${ev.id}" style="font-size:12px;color:var(--muted);padding:6px 10px;background:var(--o50);border-radius:6px;display:none"></div>
  </div>` : ''}
  <div style="margin-top:10px">
    <label style="font-size:12px;color:var(--o600);font-weight:500;display:block;margin-bottom:5px">상사 종합 의견</label>
    <textarea id="fin-mgr-note-${ev.id}" placeholder="성과 총평 및 향후 육성 방향을 작성하세요..."
      style="width:100%;min-height:80px;resize:vertical"></textarea>
  </div>
  <div class="abar">
    <button class="btn btn-purple" onclick="submitFinalMgr(${ev.id},${ev.is_second||0})">
      ${ev.is_second?'2차 최종평가 제출':'최종 평가 확정 — 잠금 처리됩니다'}
    </button>
  </div>`;

// 등급 선택 시 설명 표시
setTimeout(() => {
  const sel = document.getElementById('fin-grade-sel-' + ev.id);
  const descEl = document.getElementById('fin-grade-desc-' + ev.id);
  if (sel && descEl) {
    sel.addEventListener('change', () => {
      const selected = grades.find(g => g.grade_code === sel.value);
      descEl.textContent = selected?.description || '';
      descEl.style.display = selected?.description ? 'block' : 'none';
    });
  }
}, 100);
```

### submitFinalMgr 함수에 등급 검증 및 전송 추가

```javascript
// 1차 평가자 제출 시 — 등급 선택 필수 검증
const selectedGrade = document.getElementById('fin-grade-sel-' + evalId)?.value || '';
if (!isSecond && !selectedGrade) {
  showAlert('최종 등급을 선택해주세요.', 'orange');
  return;
}
// API 호출 시:
const res = await API.post('/final/' + evalId + '/mgr', {
  mgr_note: note, scores, selected_grade: selectedGrade
});
```

### server/index.js — POST /api/final/:evalId/mgr 에서 selected_grade 처리

```javascript
const { mgr_note, scores, selected_grade } = req.body;

// 1차 평가 완료 시 UPDATE에 selected_grade 저장
// final_evaluations 테이블에 selected_grade 컬럼 추가 (migrations)
// "ALTER TABLE final_evaluations ADD COLUMN selected_grade TEXT"

// UPDATE 쿼리:
db.prepare("UPDATE final_evaluations SET mgr_note=?,mgr_done=1,mgr_done_at=datetime('now'),mgr_approver_id=?,final_score=?,final_grade=?,selected_grade=? WHERE id=?")
  .run(encrypt(mgr_note||''), req.user.sub, finalScore, finalGradeCode, selected_grade||finalGradeCode, fe.id);
```

migrations 배열에 추가:
```javascript
"ALTER TABLE final_evaluations ADD COLUMN selected_grade TEXT",
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "개발 이력"에 추가:
```
| 오늘날짜 | 승인이력조회수정, 자기평가재제출방지, 승인이력최종평가표시, 계정승인비활성화, 중간보고목표별, 등급삭제수정+순위열, 최종평가등급선택 | Claude Code |
```

2. "DB 스키마"에 추가:
```
final_evaluations: ... selected_grade TEXT (추가)
```
