# Claude Code 작업 지시서 — 전직원 평가 현황 기간 필터 기능
# 파일: C:\claudeprojects\hrmanage\

[현재 코드를 읽지 않고, CLAUDE.md에 기록된 이전 구조 기반으로 작업해줘]

---

## 개요

관리자 설정 → 전직원 평가 현황 탭에서
현재는 직원별 최근 eval 1개만 표시됨.
기간 선택 필터를 추가해서 해당 기간의 평가 현황을 조회할 수 있도록 개선.

---

## 작업 1 — server/index.js 수정

### 1-1. GET /api/admin/eval-status 수정

기간 필터(period_label, eval_year) 쿼리 파라미터를 지원하도록 교체.

기존 GET /api/admin/eval-status 라우트 전체를 아래로 교체:

```javascript
// 전직원 평가 현황 요약 (admin+) — 기간 필터 지원
app.get('/api/admin/eval-status', auth, adminOnly, (req, res) => {
  try {
    const { period_label, eval_year } = req.query;

    const users = db.prepare(
      `SELECT id, name, dept, title, manager_id
       FROM users
       WHERE is_active=1 AND (account_status='approved' OR account_status IS NULL)
       ORDER BY dept, name`
    ).all();

    const result = users.map(u => {
      // 기간 필터가 있으면 해당 기간 eval, 없으면 최신 eval
      let ev;
      if (period_label && eval_year) {
        ev = db.prepare(
          "SELECT * FROM eval_cycles WHERE user_id=? AND period_label=? AND eval_year=? ORDER BY created_at DESC LIMIT 1"
        ).get(u.id, period_label, eval_year);
      } else {
        ev = db.prepare(
          'SELECT * FROM eval_cycles WHERE user_id=? ORDER BY created_at DESC LIMIT 1'
        ).get(u.id);
      }

      let goalCount = 0, feedbackCount = 0, finalScore = null, finalGrade = null;
      if (ev) {
        goalCount     = (db.prepare('SELECT COUNT(*) as c FROM goals WHERE eval_id=?').get(ev.id) || {}).c || 0;
        feedbackCount = (db.prepare('SELECT COUNT(*) as c FROM feedbacks WHERE eval_id=?').get(ev.id) || {}).c || 0;
        const fe      = db.prepare('SELECT final_score, final_grade FROM final_evaluations WHERE eval_id=?').get(ev.id);
        finalScore    = fe ? fe.final_score : null;
        finalGrade    = fe ? fe.final_grade : null;
      }

      return {
        id:             u.id,
        name:           u.name,
        dept:           u.dept   || '',
        title:          u.title  || '',
        phase:          ev ? ev.phase         : 'none',
        period_label:   ev ? ev.period_label  : '-',
        eval_year:      ev ? ev.eval_year     : '-',
        eval_id:        ev ? ev.id            : null,
        goal_count:     goalCount,
        feedback_count: feedbackCount,
        final_score:    finalScore,
        final_grade:    finalGrade,
        submitted_at:   ev ? ev.submitted_at  : null,
        approved_at:    ev ? ev.approved_at   : null,
        locked:         ev ? ev.locked        : 0,
        has_eval:       !!ev,  // 해당 기간에 평가 자체가 있는지 여부
      };
    });
    res.json(result);
  } catch(err) {
    console.error('[eval-status]', err);
    res.status(500).json({ error: err.message });
  }
});
```

---

## 작업 2 — public/js/pages/admin.js 수정

### 2-1. renderAdmStatus 함수 전체 교체

현재 renderAdmStatus 함수 전체를 아래로 교체:

```javascript
/* ── 전직원 평가 현황 대시보드 ── */
let _statusPeriodFilter = { label: '', year: '' }; // 선택된 기간 필터

async function renderAdmStatus() {
  const el = document.getElementById('adm-status');
  if (!el) return;
  el.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    // 평가 기간 목록 로드 (필터용)
    const periods = await API.get('/eval-periods');

    // 기간 필터 URL 구성
    let statusUrl = '/admin/eval-status';
    if (_statusPeriodFilter.label && _statusPeriodFilter.year) {
      statusUrl += `?period_label=${encodeURIComponent(_statusPeriodFilter.label)}&eval_year=${encodeURIComponent(_statusPeriodFilter.year)}`;
    }
    const data = await API.get(statusUrl);
    if (!Array.isArray(data)) throw new Error('데이터 형식 오류');

    const phaseLabel = {
      none:              { text:'평가 없음',     cls:'bd-draft'    },
      draft:             { text:'작성중',         cls:'bd-draft'    },
      pending:           { text:'승인 대기',      cls:'bd-pending'  },
      approved:          { text:'목표 확정',      cls:'bd-approved' },
      rejected:          { text:'반려됨',         cls:'bd-rejected' },
      final_self:        { text:'자기평가 중',    cls:'bd-fb'       },
      final_mgr_pending: { text:'상사평가 대기',  cls:'bd-final'    },
      final_done:        { text:'평가 완료',      cls:'bd-locked'   },
    };

    // 요약 통계 (필터 적용된 데이터 기준)
    const total    = data.length;
    const hasEval  = data.filter(u => u.has_eval).length;
    const approved = data.filter(u => ['approved','final_self','final_mgr_pending','final_done'].includes(u.phase)).length;
    const done     = data.filter(u => u.phase === 'final_done').length;
    const noEval   = data.filter(u => !u.has_eval).length;

    const byDept = {};
    data.forEach(u => {
      const d = u.dept || '미배정';
      if (!byDept[d]) byDept[d] = [];
      byDept[d].push(u);
    });

    // 현재 선택된 기간 표시
    const selectedPeriodText = (_statusPeriodFilter.label && _statusPeriodFilter.year)
      ? `${_statusPeriodFilter.label} 기준`
      : '전체 (직원별 최신 평가)';

    // 요약 카드
    const summaryCards = [
      { label:'전체 직원',   val:total,   color:'var(--o400)'   },
      { label:'평가 진행',   val:hasEval, color:'var(--o500)'   },
      { label:'목표 확정',   val:approved,color:'var(--green)'  },
      { label:'평가 완료',   val:done,    color:'var(--purple)' },
      { label:'미시작',      val:noEval,  color:'var(--muted)'  },
    ];

    const wrap = document.createElement('div');

    // ── 기간 필터 UI ──────────────────────────────────────
    const filterCard = document.createElement('div');
    filterCard.className = 'card';
    filterCard.style.marginBottom = '10px';
    filterCard.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:600;color:var(--o800);white-space:nowrap">📅 기간 조회</span>
        <select id="status-period-filter" style="height:34px;font-size:13px;flex:1;min-width:180px;max-width:300px">
          <option value="">전체 (직원별 최신 평가)</option>
          ${periods.map(p =>
            `<option value="${p.period_label}|${p.eval_year}"
              ${(_statusPeriodFilter.label === p.period_label && _statusPeriodFilter.year === p.eval_year) ? 'selected' : ''}>
              ${p.period_label} ${p.is_active ? '🟢' : '⚪'}
            </option>`
          ).join('')}
        </select>
        <button class="btn btn-primary" style="height:34px" onclick="applyStatusFilter()">조회</button>
        ${_statusPeriodFilter.label ? `<button class="btn btn-ghost" style="height:34px" onclick="clearStatusFilter()">전체 보기</button>` : ''}
        <span style="font-size:12px;color:var(--muted)">현재: <strong>${selectedPeriodText}</strong></span>
      </div>`;
    wrap.appendChild(filterCard);

    // ── 요약 카드 ─────────────────────────────────────────
    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;margin-bottom:14px';
    summaryCards.forEach(s => {
      const c = document.createElement('div');
      c.style.cssText = 'background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center';
      c.innerHTML = `<div style="font-size:24px;font-weight:700;color:${s.color}">${s.val}</div>
                     <div style="font-size:11px;color:var(--muted);margin-top:3px">${s.label}</div>`;
      summaryDiv.appendChild(c);
    });
    wrap.appendChild(summaryDiv);

    // ── 부서별 테이블 ──────────────────────────────────────
    Object.entries(byDept).forEach(function([dept, members], idx) {
      const tableId = 'dept-tbl-' + idx;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '10px';

      // 부서 헤더
      const hd = document.createElement('div');
      hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';

      // 부서 완료율
      const deptDone  = members.filter(u => u.phase === 'final_done').length;
      const deptHas   = members.filter(u => u.has_eval).length;
      const deptPct   = members.length > 0 ? Math.round(deptDone / members.length * 100) : 0;

      hd.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:14px;font-weight:600">${dept}</span>
          <span style="font-size:12px;color:var(--muted)">${members.length}명</span>
          <span style="font-size:11px;background:var(--o100);color:var(--o800);padding:2px 8px;border-radius:10px">
            진행 ${deptHas}명 · 완료 ${deptDone}명 (${deptPct}%)
          </span>
        </div>`;
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn btn-ghost btn-sm';
      toggleBtn.style.fontSize = '12px';
      toggleBtn.textContent = '접기 ▲';
      toggleBtn.onclick = function() { toggleDeptTable(tableId, this); };
      hd.appendChild(toggleBtn);
      card.appendChild(hd);

      // 진행률 바
      const progBar = document.createElement('div');
      progBar.style.cssText = 'background:var(--bg);border-radius:6px;height:6px;overflow:hidden;margin-bottom:12px;border:1px solid var(--border)';
      progBar.innerHTML = `<div style="height:100%;background:var(--o400);border-radius:6px;width:${deptPct}%;transition:width .4s"></div>`;
      card.appendChild(progBar);

      // 테이블 래퍼
      const tableWrap = document.createElement('div');
      tableWrap.id = tableId;
      const tbl = document.createElement('table');
      tbl.className = 'tbl';
      tbl.innerHTML = `<thead><tr>
        <th>이름</th><th>직책</th><th>평가 단계</th>
        ${!(_statusPeriodFilter.label) ? '<th>기간</th>' : ''}
        <th style="text-align:center">목표</th>
        <th style="text-align:center">피드백</th>
        <th style="text-align:center">최종 점수</th>
        <th></th>
      </tr></thead><tbody></tbody>`;
      const tbody = tbl.querySelector('tbody');

      members.forEach(function(u) {
        const ph = phaseLabel[u.phase] || { text: u.phase, cls: 'bd-draft' };
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        // 평가 없는 직원은 연한 배경
        if (!u.has_eval) tr.style.background = 'var(--bg)';
        tr.onclick = function() {
          if (u.eval_id) renderEvalDetail(u.id, u.name);
          else showAlert(u.name + '님은 해당 기간에 평가가 없습니다.', 'orange');
        };

        const scoreHtml = u.final_score != null
          ? `<span style="font-weight:600;color:var(--o500)">${u.final_score}점</span> <span class="grade grade-${u.final_grade}">${u.final_grade}</span>`
          : '<span style="color:var(--muted);font-size:12px">-</span>';

        tr.innerHTML = `
          <td style="font-weight:500">${u.name}</td>
          <td style="font-size:12px;color:var(--muted)">${u.title || '-'}</td>
          <td><span class="bd ${ph.cls}">${ph.text}</span></td>
          ${!(_statusPeriodFilter.label) ? `<td style="font-size:11px;color:var(--muted)">${u.period_label !== '-' ? u.period_label : '<span style="color:var(--muted)">미시작</span>'}</td>` : ''}
          <td style="text-align:center;font-size:13px">${u.has_eval ? (u.goal_count || '0') : '-'}</td>
          <td style="text-align:center;font-size:13px">${u.has_eval ? (u.feedback_count || '0') : '-'}</td>
          <td style="text-align:center">${scoreHtml}</td>
          <td>
            ${u.eval_id
              ? `<button class="btn btn-ghost btn-sm" style="font-size:11px"
                   onclick="event.stopPropagation();renderEvalDetail(${u.id},'${u.name}')">상세</button>`
              : `<span style="font-size:11px;color:var(--muted)">미시작</span>`}
          </td>`;

        tr.querySelector('button')?.addEventListener('click', function(e) {
          e.stopPropagation();
          renderEvalDetail(u.id, u.name);
        });
        tbody.appendChild(tr);
      });

      tableWrap.appendChild(tbl);
      card.appendChild(tableWrap);
      wrap.appendChild(card);
    });

    el.innerHTML = '';
    el.appendChild(wrap);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
}

function applyStatusFilter() {
  const sel = document.getElementById('status-period-filter');
  if (!sel) return;
  const val = sel.value;
  if (!val) {
    _statusPeriodFilter = { label: '', year: '' };
  } else {
    const parts = val.split('|');
    _statusPeriodFilter = { label: parts[0], year: parts[1] || '' };
  }
  renderAdmStatus();
}

function clearStatusFilter() {
  _statusPeriodFilter = { label: '', year: '' };
  renderAdmStatus();
}
```

---

## 작업 완료 후 CLAUDE.md 업데이트 (필수)

1. "개발 이력"에 추가:
   ```
   | 오늘날짜 | 전직원 평가 현황 기간 필터 추가, 부서별 진행률 바 추가, 미시작 직원 표시 | Claude Code |
   ```

2. "API 엔드포인트 목록"에서 아래 수정:
   ```
   GET  /api/admin/eval-status?period_label=&eval_year=   전직원 평가 현황 (기간 필터 지원)
   ```
