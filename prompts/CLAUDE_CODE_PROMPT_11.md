# Claude Code 작업 지시서 11
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]

---

## 작업 1 — 중간 피드백 중복 표시 버그 수정 (feedback.js)

### 원인 1: renderGiveFeedback 이중 호출
feedback.js에서 아래 두 줄이 모두 있어서 중복 렌더링 발생:
```javascript
if (tabs.some(t=>t.id==='fb-give')) renderGiveFeedback(reporteeEvs, evs);
if (tabs[0]?.id === 'fb-give') renderGiveFeedback(reporteeEvs, evs);
```
두 번째 줄 제거:
```javascript
// 아래 줄만 남김
if (tabs.some(t=>t.id==='fb-give')) renderGiveFeedback(reporteeEvs, evs);
```

### 원인 2: 같은 직원의 여러 기간 eval이 모두 표시됨
reporteeEvs 필터에서 직원별로 최신 eval 1개만 표시하도록 수정.

Pages.feedback 함수에서 reporteeEvs 생성 부분을 아래로 교체:

```javascript
  // 내가 승인자인 직원들 — 직원별로 가장 최신 approved eval 1개만
  const allReporteeEvs = evs.filter(e =>
    String(e.user_id) !== String(App.user.id) &&
    ['approved','final_self','final_mgr_pending','final_done'].includes(e.phase)
  );
  // 직원별 그룹핑 후 최신 1개만
  const reporteeMap = {};
  allReporteeEvs.forEach(e => {
    const uid = String(e.user_id);
    if (!reporteeMap[uid] || new Date(e.created_at) > new Date(reporteeMap[uid].created_at)) {
      reporteeMap[uid] = e;
    }
  });
  const reporteeEvs = Object.values(reporteeMap);
```

---

## 작업 2 — 중간 피드백과 중간 보고 연동 (feedback.js)

### 피드백 작성 화면에 중간 보고 표시 추가

renderGiveFeedback 함수에서 각 직원 카드 상단에
해당 직원의 중간 보고 내용을 먼저 보여주고, 그 아래에 피드백 작성 폼 배치.

renderGiveFeedback 함수 시작 부분(for 루프 안)에 추가:

```javascript
async function renderGiveFeedback(reporteeEvs, allEvs) {
  const el = document.getElementById('fb-give'); if(!el) return;
  el.innerHTML = '';

  for (const ev of reporteeEvs) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '12px';

    // 직원 헤더
    const hd = document.createElement('div');
    hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px';
    hd.innerHTML = `
      <div>
        <div style="font-size:15px;font-weight:600">${ev.user_name||''}
          <span style="font-size:12px;color:var(--muted);font-weight:400"> · ${ev.dept||''}</span>
        </div>
        <div style="font-size:12px;color:var(--muted)">${ev.period_label||''}</div>
      </div>
      <span class="bd bd-approved">목표 확정</span>`;
    card.appendChild(hd);

    // ── 중간 보고 섹션 (먼저 표시) ──────────────────────
    try {
      const reports = await API.get('/reports/' + ev.id);
      if (reports && reports.length) {
        const rptSection = document.createElement('div');
        rptSection.style.cssText = 'background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:12px;margin-bottom:14px';
        rptSection.innerHTML = `
          <div style="font-size:12px;font-weight:600;color:var(--o700);margin-bottom:8px">
            📋 중간 보고 (${reports.length}건)
          </div>
          ${reports.map((r,i) => `
            <div style="padding:8px 0;border-bottom:1px solid var(--o100);${i===reports.length-1?'border:none':''}">
              <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${(r.created_at||'').slice(0,16)}</div>
              <div style="font-size:13px;line-height:1.6;white-space:pre-wrap">${r.content||''}</div>
              ${r.files?.length ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">첨부: ${r.files.map(f=>f.file_name).join(', ')}</div>` : ''}
            </div>`).join('')}`;
        card.appendChild(rptSection);
      } else {
        const noRpt = document.createElement('div');
        noRpt.style.cssText = 'font-size:12px;color:var(--muted);padding:6px 10px;background:var(--bg);border-radius:6px;margin-bottom:10px';
        noRpt.textContent = '📋 아직 작성된 중간 보고가 없습니다.';
        card.appendChild(noRpt);
      }
    } catch(e) {}

    // ── 기존 피드백 이력 ──────────────────────────────
    // (기존 renderGiveFeedback의 피드백 조회 및 폼 생성 로직을 여기에 유지)
    // 기존 코드에서 goals, feedbacks 로드 및 폼 HTML 생성 부분은 그대로 유지하되
    // card.appendChild(hd) 이후에 위의 중간보고 섹션을 먼저 추가하는 방식으로 재구성

    el.appendChild(card);
  }
}
```

---

## 작업 3 — 직급(grade) 전체 화면 반영

### 3-1. 직급이 표시되어야 하는 모든 위치

아래 패턴을 찾아서 직급을 추가해줘.
기본 원칙: `이름 · 부서 · 직책` → `이름 · 부서 · 직급 · 직책`

#### approvals.js — 승인 대기 목록
```javascript
// 찾을 패턴: ev.dept || ev.title
// 수정: `${ev.dept||''} · ${ev.grade||''} ${ev.title||''}`
```

#### feedback.js — 피드백 대상자 표시
```javascript
// ev.user_name 옆 부서/직책
// `${ev.dept||''} · ${ev.grade||''} ${ev.title||''}`
```

#### admin.js — 계정 승인 관리 탭 (renderAdmAccounts)
가입 신청 대기 카드에서:
```javascript
// 기존: `${u.dept||'부서미입력'} · ${u.title||'직책미입력'}`
// 수정: `${u.dept||'부서미입력'} · ${u.grade||'직급미입력'} · ${u.title||'직책미입력'}`
```
승인 시 설정 폼에 직급 입력 추가:
```javascript
// ap-dept, ap-title 사이에 아래 추가
`<div style="flex:1;min-width:90px">
  <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">직급</label>
  <input id="ap-grade-${u.id}" value="${u.grade||''}" placeholder="사원" style="height:32px;font-size:12px">
</div>`
```

approveAccount 함수에서 grade 수집 추가:
```javascript
const grade = document.getElementById('ap-grade-'+uid)?.value || '';
await API.post('/users/'+uid+'/approve', { role, dept, grade, title, manager_id: mgr });
```

#### admin.js — 활성 계정 관리 테이블
```javascript
// 부서·직책 컬럼
// `${u.dept||'-'} · ${u.grade||''} · ${u.title||'-'}`
```

#### admin.js — 조직도 목록 방식 (renderOrgList)
```javascript
// `${u.dept||''} · ${u.grade||''} · ${u.title||''}`
```

#### admin.js — 조직도 차트 방식 노드
```javascript
// 노드 innerHTML의 직급/직책 줄
// `${u.grade||''} ${u.title||''}`
// `${u.dept||''}`
```

#### admin.js — 전직원 평가 현황 테이블
```javascript
// 직책 컬럼 → 직급+직책으로
// `${u.grade||''} ${u.title||'-'}`
```

#### admin.js — 권한 관리 탭 (renderAdmRoles)
```javascript
// 직원 목록에 직급 추가
// `${u.dept||''} · ${u.grade||''} · ${u.title||''}`
```

#### my-eval.js — 승인자 체인 표시
```javascript
// `${i+1}차 ${a.name}(${a.grade||''} ${a.title||''})`
```

#### approvals.js — 승인 관리 내 승인 이력
```javascript
// `${h.target_dept||''} · ${h.target_grade||''} · ${h.target_title||''}`
```

### 3-2. server/index.js — grade 컬럼 API 응답에 포함

GET /api/users 응답에 grade 포함 확인.
GET /api/evals 에서 JOIN해서 user 정보 가져올 때 grade 포함:
```javascript
// eval_cycles 조회 시 users JOIN에 grade 추가
'SELECT e.*, u.name as user_name, u.dept, u.grade, u.title, u.manager_id ...'
```

GET /api/approvals/pending 에서도 grade 포함:
```javascript
'SELECT e.*, u.name as user_name, u.dept, u.grade, u.title, u.manager_id ...'
```

GET /api/approvals/my-history 에서도 grade 포함:
```javascript
'... u.grade as target_grade ...'
```

POST /api/users/:id/approve 에서 grade 처리:
```javascript
const { role, dept, grade, title, manager_id } = req.body;
db.prepare("UPDATE users SET account_status='approved',is_active=1,role=?,dept=COALESCE(?,dept),grade=COALESCE(?,grade),title=COALESCE(?,title),manager_id=? WHERE id=?")
  .run(role||'user', dept||null, grade||null, title||null, manager_id||null, req.params.id);
```

---

## 작업 4 — 최종 평가 UI 수정 + 파일 첨부 (final-eval.js + server/index.js)

### 4-1. final-eval.js — textarea 너비 수정

자기 최종 의견 textarea:
```javascript
// 찾기: id="fin-self-note" ... style="min-height:72px"
// 교체: style="width:100%;min-height:100px;resize:vertical;display:block"
```

상사 최종 의견 textarea:
```javascript
// 찾기: id="fin-mgr-note-${ev.id}" ... style="min-height:72px"
// 교체: style="width:100%;min-height:100px;resize:vertical;display:block"
```

### 4-2. final-eval.js — 파일 첨부 추가

자기 최종 평가 폼(submitFinalSelf 관련)에서
textarea 아래에 파일 첨부 위젯 추가:

```javascript
// textarea 다음 줄에
const finalSelfFileWrap = document.createElement('div');
finalSelfFileWrap.id = 'final-self-file-wrap';
finalSelfFileWrap.appendChild(FileAttachWidget('final-self'));
// textarea가 있는 컨테이너에 appendChild
```

submitFinalSelf 함수에서 files 수집:
```javascript
const fileWidget = document.querySelector('#final-self-file-wrap > div');
const files = fileWidget?.getFiles ? fileWidget.getFiles() : [];
await API.post('/final/'+evalId+'/self', { self_note: note, scores, files });
```

상사 최종 평가 폼도 동일하게:
```javascript
const finalMgrFileWrap = document.createElement('div');
finalMgrFileWrap.id = 'final-mgr-file-wrap-' + ev.id;
finalMgrFileWrap.appendChild(FileAttachWidget('final-mgr-' + ev.id));
```

submitFinalMgr 함수:
```javascript
const mgrFileWidget = document.querySelector('#final-mgr-file-wrap-' + evalId + ' > div');
const mgrFiles = mgrFileWidget?.getFiles ? mgrFileWidget.getFiles() : [];
await API.post('/final/'+evalId+'/mgr', { mgr_note: note, scores, files: mgrFiles });
```

### 4-3. server/index.js — 최종 평가 파일 저장

migrations 배열에 추가:
```javascript
"ALTER TABLE report_files ADD COLUMN final_eval_id INTEGER",
```

POST /api/final/:evalId/self 라우트에서 파일 저장:
```javascript
// 기존 INSERT 후
const { files } = req.body;
(files || []).forEach(f => {
  db.prepare(
    'INSERT INTO report_files(final_eval_id,file_name,file_data,file_type,file_size) VALUES(?,?,?,?,?)'
  ).run(fe.id, f.name, f.data, f.type, f.size);
});
```

GET /api/final/:evalId 에서 파일 포함:
```javascript
// fe 조회 후
fe.files = db.prepare(
  'SELECT id,file_name,file_type,file_size,created_at FROM report_files WHERE final_eval_id=?'
).all(fe.id);
```

최종 평가 조회 화면에서 파일 표시:
```javascript
// self_note, mgr_note 표시 부분 아래에
${renderFileList(fe.files||[])}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "알려진 버그" 섹션에서 [x] 처리:
   - 중간 피드백 이중 표시 버그 (renderGiveFeedback 이중 호출)
   - 같은 직원 여러 기간 eval 모두 표시 버그

2. "개발 이력"에 추가:
   ```
   | 오늘날짜 | 피드백중복버그수정, 중간보고-피드백연동, 직급전체화면반영, 최종평가textarea너비+파일첨부 | Claude Code |
   ```
