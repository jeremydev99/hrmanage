# Claude Code 작업 지시서 31
# 위치: C:\claudeprojects\hrmanage\CLAUDE_CODE_PROMPT_31.md

[CLAUDE.md를 먼저 읽고, 실제 파일을 직접 열어서 현재 상태를 확인한 후 작업해줘]
[작업 완료 후 반드시 CLAUDE.md 업데이트]
[작업 완료 후 git push 하지 말 것]

---

## 작업 목표: 성과관리 홈 대시보드 (역할별 뷰 + AI 요약)

### 핵심 설계
```
역할별 뷰:
  일반 직원:  내 성과 요약
  리더(조직장): 내 성과 + 우리 팀 현황
  관리자:     내 성과 + 전체 조직 현황

평가방식별 구분:
  MBO: 별점 평균 → % 환산 (5점=100%)
  OKR: KR 달성률 평균 (0~100%)
  KPI: 목표치 대비 실적 % (추후)

대시보드 계층 설정:
  기본 2단계, 최대 3단계 (관리자 설정)
  4단계는 비활성화

AI 요약:
  Claude API 활용
  개인/팀/전사 레벨별 다른 프롬프트
```

---

## 작업 1 — server/index.js: 성과관리 API 추가

### 1-1. 대시보드 계층 설정 API

```javascript
// 대시보드 표시 최대 단계 설정/조회
app.get('/api/settings/dashboard-depth', auth, (req, res) => {
  try {
    const s = db.prepare(
      "SELECT value FROM app_settings WHERE key='dashboard_depth'"
    ).get();
    res.json({ depth: parseInt(s?.value || '2') });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/dashboard-depth', auth, adminOnly, (req, res) => {
  try {
    const depth = parseInt(req.body.depth);
    if (![1,2,3].includes(depth))
      return res.status(400).json({ error: '1~3단계만 설정 가능합니다. (4단계 미지원)' });
    db.prepare(`
      INSERT INTO app_settings(key,value,updated_by,updated_at)
      VALUES('dashboard_depth',?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value=excluded.value, updated_by=excluded.updated_by,
        updated_at=excluded.updated_at
    `).run(depth.toString(), req.user.sub);
    auditLog(req.user.sub, 'DASHBOARD_DEPTH_CHANGED', null, null,
      `대시보드 계층 변경: ${depth}단계`, req.ip);
    res.json({ success: true, depth });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 1-2. 내 성과 요약 API

```javascript
// 내 성과 요약 (기간 필터 포함)
app.get('/api/perf/my-summary', auth, (req, res) => {
  try {
    const { period_id } = req.query;
    const userId = req.user.sub;

    // 활성 또는 선택된 평가 기간
    const periods = period_id
      ? [db.prepare('SELECT * FROM eval_periods WHERE id=?').get(period_id)]
      : db.prepare('SELECT * FROM eval_periods WHERE is_active=1 ORDER BY id DESC').all();

    const result = periods.filter(Boolean).map(period => {
      // MBO 평가 데이터
      const evals = db.prepare(`
        SELECT e.*, fe.final_score, fe.selected_grade, fe.self_done, fe.mgr_done
        FROM eval_cycles e
        LEFT JOIN final_evaluations fe ON fe.eval_id=e.id
        WHERE e.user_id=? AND e.period_label=? AND e.eval_year=?
      `).all(userId, period.period_label, period.eval_year);

      // 중간 보고 수
      const reportCount = db.prepare(`
        SELECT COUNT(*) as c FROM progress_reports pr
        JOIN eval_cycles e ON pr.eval_id=e.id
        WHERE e.user_id=? AND e.period_label=?
      `).get(userId, period.period_label)?.c || 0;

      // 받은 피드백 수
      const feedbackCount = db.prepare(`
        SELECT COUNT(*) as c FROM feedbacks f
        JOIN eval_cycles e ON f.eval_id=e.id
        WHERE e.user_id=? AND e.period_label=?
      `).get(userId, period.period_label)?.c || 0;

      // OKR 데이터
      const okrCycles = db.prepare(`
        SELECT oc.*, 
          (SELECT COUNT(*) FROM okr_objectives WHERE cycle_id=oc.id) as obj_count
        FROM okr_cycles oc
        WHERE oc.user_id=? AND oc.period_label=?
      `).all(userId, period.period_label);

      // OKR 달성률 계산
      let okrAvg = null;
      if (okrCycles.length) {
        let totalKRs = 0, totalPct = 0;
        okrCycles.forEach(cycle => {
          const objs = db.prepare(
            'SELECT * FROM okr_objectives WHERE cycle_id=?'
          ).all(cycle.id);
          objs.forEach(obj => {
            const krs = db.prepare(
              'SELECT * FROM okr_key_results WHERE objective_id=?'
            ).all(obj.id);
            krs.forEach(kr => {
              totalKRs++;
              totalPct += kr.target_value > 0
                ? (kr.current_value / kr.target_value) * 100 : 0;
            });
          });
        });
        okrAvg = totalKRs > 0 ? Math.round(totalPct / totalKRs) : 0;
      }

      // MBO 점수
      const mboScore = evals[0]?.final_score || null;

      return {
        period_id: period.id,
        period_label: period.period_label,
        eval_year: period.eval_year,
        eval_mode: period.eval_mode || 'MBO',
        mbo_score: mboScore,
        okr_avg: okrAvg,
        report_count: reportCount,
        feedback_count: feedbackCount,
        phase: evals[0]?.phase || null,
        self_done: evals[0]?.self_done || 0,
        mgr_done: evals[0]?.mgr_done || 0,
      };
    });

    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 1-3. 팀 성과 요약 API (리더용)

```javascript
// 팀 성과 요약 (조직장용)
app.get('/api/perf/team-summary', auth, (req, res) => {
  try {
    const { period_id } = req.query;
    const userId = req.user.sub;
    const maxDepth = parseInt(
      db.prepare("SELECT value FROM app_settings WHERE key='dashboard_depth'")
        .get()?.value || '2'
    );

    // 내 조직 찾기
    const myOrg = db.prepare(
      'SELECT * FROM organizations WHERE leader_id=? AND is_active=1'
    ).get(userId);

    if (!myOrg) return res.json({ is_leader: false, teams: [] });

    // 하위 조직원 수집 (maxDepth 단계까지)
    function getSubMembers(orgId, depth) {
      if (depth > maxDepth) return [];
      const members = db.prepare(
        'SELECT id, name, title FROM users WHERE org_id=? AND is_active=1'
      ).all(orgId);
      const subOrgs = db.prepare(
        'SELECT * FROM organizations WHERE parent_id=? AND is_active=1'
      ).all(orgId);
      const subMembers = subOrgs.flatMap(o => getSubMembers(o.id, depth + 1));
      return [...members, ...subMembers];
    }

    const members = getSubMembers(myOrg.id, 1);

    // 기간 설정
    const periods = period_id
      ? [db.prepare('SELECT * FROM eval_periods WHERE id=?').get(period_id)]
      : db.prepare('SELECT * FROM eval_periods WHERE is_active=1 ORDER BY id DESC LIMIT 3').all();

    const teamData = periods.filter(Boolean).map(period => {
      const memberStats = members.map(m => {
        const ev = db.prepare(`
          SELECT e.phase, fe.final_score, fe.mgr_done
          FROM eval_cycles e
          LEFT JOIN final_evaluations fe ON fe.eval_id=e.id
          WHERE e.user_id=? AND e.period_label=?
          ORDER BY e.id DESC LIMIT 1
        `).get(m.id, period.period_label);

        // OKR 달성률
        const okr = db.prepare(
          'SELECT * FROM okr_cycles WHERE user_id=? AND period_label=?'
        ).all(m.id, period.period_label);
        let okrAvg = null;
        if (okr.length) {
          let t = 0, p = 0;
          okr.forEach(c => {
            const objs = db.prepare(
              'SELECT * FROM okr_objectives WHERE cycle_id=?'
            ).all(c.id);
            objs.forEach(obj => {
              db.prepare(
                'SELECT * FROM okr_key_results WHERE objective_id=?'
              ).all(obj.id).forEach(kr => {
                t++;
                p += kr.target_value > 0 ? (kr.current_value/kr.target_value)*100 : 0;
              });
            });
          });
          okrAvg = t > 0 ? Math.round(p/t) : 0;
        }

        return {
          user_id: m.id,
          name: m.name,
          title: m.title,
          phase: ev?.phase || null,
          final_score: ev?.final_score || null,
          okr_avg: okrAvg,
          mgr_done: ev?.mgr_done || 0,
        };
      });

      // 팀 평균
      const scored = memberStats.filter(m => m.final_score !== null);
      const teamAvg = scored.length
        ? Math.round(scored.reduce((a,m) => a + m.final_score, 0) / scored.length * 10) / 10
        : null;

      const okrScored = memberStats.filter(m => m.okr_avg !== null);
      const teamOkrAvg = okrScored.length
        ? Math.round(okrScored.reduce((a,m) => a + m.okr_avg, 0) / okrScored.length)
        : null;

      return {
        period_label: period.period_label,
        eval_year: period.eval_year,
        eval_mode: period.eval_mode || 'MBO',
        member_count: members.length,
        team_avg_score: teamAvg,
        team_okr_avg: teamOkrAvg,
        members: memberStats,
      };
    });

    res.json({
      is_leader: true,
      org_name: myOrg.name,
      teams: teamData,
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});
```

### 1-4. AI 요약 API

```javascript
// AI 성과 요약 (Claude API 활용)
app.post('/api/perf/ai-summary', auth, async (req, res) => {
  try {
    const { type, data } = req.body;
    // type: 'personal' | 'team' | 'org'

    let prompt = '';
    if (type === 'personal') {
      prompt = `다음은 ${data.name}님의 성과 데이터입니다. 3줄로 성과를 요약하고 개선 포인트 1가지를 제안해주세요.

평가 데이터:
${JSON.stringify(data.periods, null, 2)}

형식:
📊 성과 요약: (2줄)
💡 개선 제안: (1줄)`;
    } else if (type === 'team') {
      prompt = `다음은 ${data.org_name} 팀의 성과 데이터입니다. 팀 전체 성과를 3줄로 요약하고 리더를 위한 액션 제안 1가지를 해주세요.

팀 데이터:
${JSON.stringify(data.teams, null, 2)}

형식:
📊 팀 성과 요약: (2줄)
💡 리더 액션 제안: (1줄)`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const result = await response.json();
    const text = result.content?.[0]?.text || '요약을 생성할 수 없습니다.';
    res.json({ summary: text });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## 작업 2 — admin.js: 평가 정책 탭에 대시보드 계층 설정 추가

renderAdmPolicy Promise.all에 추가:
```javascript
API.get('/settings/dashboard-depth').catch(() => ({ depth: 2 })),
```

정책 UI에 추가:
```javascript
<div class="policy-row">
  <div>
    <div style="font-size:14px;font-weight:500">대시보드 표시 계층</div>
    <div style="font-size:12px;color:var(--muted)">
      성과관리 홈에서 조직 성과를 몇 단계까지 표시할지 설정
      (4단계 이상은 지원하지 않습니다)
    </div>
  </div>
  <div style="display:flex;gap:6px;align-items:center">
    ${[1,2,3].map(d => `
      <button class="btn btn-sm ${dashDepth.depth===d?'btn-primary':'btn-ghost'}"
        onclick="saveDashDepth(${d})" style="font-size:12px">
        ${d}단계${d===2?' (기본)':d===3?' (옵션)':''}
      </button>`).join('')}
    <span style="font-size:11px;color:var(--muted)">4단계 이상 미지원</span>
  </div>
</div>
```

saveDashDepth 함수 추가:
```javascript
async function saveDashDepth(depth) {
  try {
    await API.post('/settings/dashboard-depth', { depth });
    showAlert(`대시보드 계층이 ${depth}단계로 설정되었습니다.`, 'green');
    renderAdmPolicy();
  } catch(e) { showAlert(e.message, 'red'); }
}
```

---

## 작업 3 — app.js: Pages.perfHome 상세 구현

기존 임시 구현(프롬프트 30)을 아래로 교체:

```javascript
Pages.perfHome = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';

  try {
    const user = App.user;
    const isAdmin = ['master','admin'].includes(user?.role);

    // 데이터 로드
    const [mySummary, teamSummary, periods] = await Promise.all([
      API.get('/perf/my-summary').catch(() => []),
      API.get('/perf/team-summary').catch(() => ({ is_leader: false, teams: [] })),
      API.get('/eval-periods/active').catch(() => []),
    ]);

    area.innerHTML = '';

    // 헤더
    const header = document.createElement('div');
    header.style.marginBottom = '16px';
    header.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--o800)">📊 성과관리 홈</div>
          <div style="font-size:12px;color:var(--muted)">기간별 성과 요약 및 AI 분석</div>
        </div>
        <!-- 뷰 선택 탭 -->
        <div style="display:flex;gap:4px">
          <button class="btn btn-primary btn-sm perf-view-btn" id="view-my"
            onclick="switchPerfView('my')">내 성과</button>
          ${teamSummary.is_leader ? `
          <button class="btn btn-ghost btn-sm perf-view-btn" id="view-team"
            onclick="switchPerfView('team')">우리 팀</button>` : ''}
          ${isAdmin ? `
          <button class="btn btn-ghost btn-sm perf-view-btn" id="view-org"
            onclick="switchPerfView('org')">전체 조직</button>` : ''}
        </div>
      </div>`;
    area.appendChild(header);

    // 내 성과 뷰
    const myView = document.createElement('div');
    myView.id = 'perf-view-my';
    myView.innerHTML = renderMyPerfView(mySummary, user);
    area.appendChild(myView);

    // 팀 성과 뷰
    if (teamSummary.is_leader) {
      const teamView = document.createElement('div');
      teamView.id = 'perf-view-team';
      teamView.style.display = 'none';
      teamView.innerHTML = renderTeamPerfView(teamSummary);
      area.appendChild(teamView);
    }

    // 전체 조직 뷰 (admin)
    if (isAdmin) {
      const orgView = document.createElement('div');
      orgView.id = 'perf-view-org';
      orgView.style.display = 'none';
      orgView.innerHTML = `
        <div class="card">
          <div class="alert alert-teal">
            🚧 전체 조직 뷰는 준비 중입니다.
          </div>
        </div>`;
      area.appendChild(orgView);
    }

    // AI 요약 영역
    const aiSection = document.createElement('div');
    aiSection.id = 'ai-summary-section';
    aiSection.className = 'card';
    aiSection.style.marginTop = '12px';
    aiSection.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:14px;font-weight:600">🤖 AI 성과 요약</div>
        <button class="btn btn-ghost btn-sm" onclick="loadAISummary('personal')">
          요약 생성
        </button>
      </div>
      <div id="ai-summary-content" style="font-size:13px;color:var(--muted);line-height:1.8">
        '요약 생성' 버튼을 클릭하면 AI가 성과를 분석합니다.
      </div>`;
    area.appendChild(aiSection);

    // 전역 변수에 데이터 저장
    window._perfData = { mySummary, teamSummary, user };

  } catch(err) {
    area.innerHTML = `<div class="alert alert-red">오류: ${err.message}</div>`;
  }
};

function renderMyPerfView(summary, user) {
  if (!summary.length) {
    return `<div class="card"><div class="alert alert-orange">
      활성화된 평가 기간이 없습니다.</div></div>`;
  }

  return summary.map(s => {
    const score = s.eval_mode === 'OKR' ? s.okr_avg : s.mbo_score;
    const scoreLabel = s.eval_mode === 'OKR' ? '달성률' : '최종 점수';
    const scoreColor = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--o500)' : '#E53935';

    return `
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;
                  flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div>
          <div style="font-size:15px;font-weight:600">${s.period_label}</div>
          <div style="font-size:12px;color:var(--muted)">
            ${s.eval_year} ·
            <span class="bd bd-${s.eval_mode==='OKR'?'teal':'approved'}" style="font-size:10px">
              ${s.eval_mode}
            </span>
          </div>
        </div>
        <div style="display:flex;gap:16px;align-items:center">
          ${score !== null ? `
          <div style="text-align:center">
            <div style="font-size:24px;font-weight:800;color:${scoreColor}">
              ${score}${s.eval_mode==='OKR'?'%':'점'}
            </div>
            <div style="font-size:11px;color:var(--muted)">${scoreLabel}</div>
          </div>` : ''}
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:700;color:var(--o500)">
              ${s.report_count}건
            </div>
            <div style="font-size:11px;color:var(--muted)">중간 보고</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:700;color:var(--o500)">
              ${s.feedback_count}건
            </div>
            <div style="font-size:11px;color:var(--muted)">받은 피드백</div>
          </div>
        </div>
      </div>

      <!-- 달성률 바 -->
      ${score !== null ? `
      <div style="background:var(--o100);border-radius:20px;height:8px">
        <div style="background:${scoreColor};border-radius:20px;height:100%;
                    width:${Math.min(s.eval_mode==='OKR'?score:score/5*100,100)}%;
                    transition:width .4s"></div>
      </div>` : ''}
    </div>`;
  }).join('');
}

function renderTeamPerfView(teamData) {
  if (!teamData.teams.length) {
    return `<div class="card"><div class="alert alert-orange">팀 데이터가 없습니다.</div></div>`;
  }

  return `
    <div style="font-size:14px;font-weight:600;color:var(--o800);margin-bottom:10px">
      ${teamData.org_name} 팀 현황
    </div>
    ${teamData.teams.map(t => `
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;
                  flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div>
          <div style="font-size:15px;font-weight:600">${t.period_label}</div>
          <div style="font-size:12px;color:var(--muted)">
            팀원 ${t.member_count}명 ·
            <span class="bd bd-${t.eval_mode==='OKR'?'teal':'approved'}" style="font-size:10px">
              ${t.eval_mode}
            </span>
          </div>
        </div>
        ${t.team_avg_score !== null || t.team_okr_avg !== null ? `
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:800;color:var(--o500)">
            ${t.eval_mode==='OKR'
              ? (t.team_okr_avg||0)+'%'
              : (t.team_avg_score||0)+'점'}
          </div>
          <div style="font-size:11px;color:var(--muted)">팀 평균</div>
        </div>` : ''}
      </div>

      <!-- 팀원별 현황 -->
      <div style="display:flex;flex-direction:column;gap:6px">
        ${t.members.map(m => {
          const score = t.eval_mode==='OKR' ? m.okr_avg : m.final_score;
          const pct = score !== null
            ? (t.eval_mode==='OKR' ? score : score/5*100)
            : 0;
          const col = pct>=70?'var(--green)':pct>=50?'var(--o500)':'#E53935';
          return `
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;min-width:80px;color:var(--o700)">
              ${m.name} ${m.title||''}
            </span>
            <div style="flex:1;background:var(--o100);border-radius:10px;height:6px">
              <div style="background:${col};border-radius:10px;height:100%;
                          width:${Math.min(pct,100)}%;transition:width .4s"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:${col};min-width:40px;text-align:right">
              ${score !== null
                ? (t.eval_mode==='OKR' ? score+'%' : score+'점')
                : '-'}
            </span>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('')}`;
}

function switchPerfView(view) {
  ['my','team','org'].forEach(v => {
    const el = document.getElementById('perf-view-'+v);
    const btn = document.getElementById('view-'+v);
    if (el) el.style.display = v===view ? 'block' : 'none';
    if (btn) {
      btn.classList.toggle('btn-primary', v===view);
      btn.classList.toggle('btn-ghost', v!==view);
    }
  });

  // AI 요약 타입 변경
  const aiBtn = document.querySelector('#ai-summary-section button');
  if (aiBtn) aiBtn.onclick = () => loadAISummary(
    view==='my' ? 'personal' : view==='team' ? 'team' : 'org'
  );
}

async function loadAISummary(type) {
  const content = document.getElementById('ai-summary-content');
  if (!content) return;
  content.innerHTML = '<div class="spinner" style="font-size:13px">AI 분석 중...</div>';

  try {
    const d = window._perfData;
    const payload = type === 'personal'
      ? { type, data: { name: d.user?.name, periods: d.mySummary } }
      : { type, data: d.teamSummary };

    const r = await API.post('/perf/ai-summary', payload);
    content.innerHTML = `
      <div style="white-space:pre-wrap;line-height:1.8;color:var(--o800)">
        ${r.summary}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">
        AI 분석 결과는 참고용입니다. 실제 평가와 다를 수 있습니다.
      </div>`;
  } catch(e) {
    content.innerHTML = `<div style="color:#E53935;font-size:13px">
      AI 요약 생성 실패: ${e.message}</div>`;
  }
}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

### 개발 이력에 추가:
```
| 오늘날짜 | 성과관리 홈 대시보드 (역할별 뷰, 기간별 차트, AI 요약, 계층 설정) | Claude Code |
```

### API 목록에 추가:
```
GET  /api/settings/dashboard-depth   대시보드 계층 설정 조회
POST /api/settings/dashboard-depth   대시보드 계층 설정 변경 (admin+)
GET  /api/perf/my-summary            내 성과 요약
GET  /api/perf/team-summary          팀 성과 요약 (조직장)
POST /api/perf/ai-summary            AI 성과 요약 생성
```

### 핵심 설계 원칙에 추가:
```
- 성과관리 홈 (Pages.perfHome):
  역할별 뷰: 내 성과 / 우리 팀 / 전체 조직
  평가방식별: MBO(점수) / OKR(달성률%) 구분 표시
  대시보드 계층: 기본 2단계, 최대 3단계 (4단계 미지원)
  AI 요약: Claude API → 개인/팀 레벨별 분석
  계층 설정: 관리자 설정 → 평가 정책 탭
```
