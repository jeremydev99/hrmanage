/* ── 중간 보고 페이지 ── */
Pages = window.Pages || {};

Pages.progressReport = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const evs = await API.get('/evals');

    // 내가 작성할 수 있는 eval (목표 확정 이후)
    const myEvs = evs.filter(e =>
      String(e.user_id) === String(App.user.id) &&
      ['approved','final_self','final_mgr_pending','final_done'].includes(e.phase)
    );

    // 내가 승인자인 직원들의 eval (보고 조회용) — 직원별 최신 1개
    const reporteeMap = {};
    evs.filter(e =>
      String(e.user_id) !== String(App.user.id) &&
      ['approved','final_self','final_mgr_pending','final_done'].includes(e.phase)
    ).forEach(e => {
      const uid = String(e.user_id);
      if (!reporteeMap[uid] || new Date(e.created_at) > new Date(reporteeMap[uid].created_at))
        reporteeMap[uid] = e;
    });
    const reporteeEvs = Object.values(reporteeMap);

    area.innerHTML = '';

    // 탭 구성
    const tabs = [];
    if (myEvs.length)      tabs.push({ id:'rpt-mine', label:'내 중간 보고' });
    if (reporteeEvs.length) tabs.push({ id:'rpt-view', label:`보고 조회 (${reporteeEvs.length}명)` });

    if (!tabs.length) {
      area.innerHTML = `<div class="card">
        <div class="alert alert-orange">
          목표가 확정된 후 중간 보고를 작성할 수 있습니다.<br>
          먼저 목표를 설정하고 승인을 받아주세요.
        </div>
      </div>`;
      return;
    }

    // 탭 UI
    const tabsEl = document.createElement('div');
    tabsEl.className = 'stabs';
    tabsEl.innerHTML = tabs.map((t,i) =>
      `<button class="stb${i===0?' active':''}" id="stb-${t.id}" onclick="switchRptTab('${t.id}')">${t.label}</button>`
    ).join('');
    area.appendChild(tabsEl);

    tabs.forEach((t,i) => {
      const sp = document.createElement('div');
      sp.className = 'sp' + (i===0?' active':'');
      sp.id = t.id;
      area.appendChild(sp);
    });

    if (tabs[0].id === 'rpt-mine') await renderMyReports(myEvs);
    if (tabs.some(t => t.id === 'rpt-view')) await renderViewReports(reporteeEvs);

  } catch(e) {
    area.innerHTML = `<div class="alert alert-red">오류: ${e.message}</div>`;
  }
};

function switchRptTab(id) {
  document.querySelectorAll('.stb').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sp').forEach(s => s.classList.remove('active'));
  document.getElementById('stb-'+id)?.classList.add('active');
  document.getElementById(id)?.classList.add('active');
}

/* ── 내 중간 보고 작성 ── */
async function renderMyReports(evList) {
  const el = document.getElementById('rpt-mine');
  if (!el) return;
  el.innerHTML = '';

  for (const ev of evList) {
    const reports = await API.get('/reports/' + ev.id).catch(() => []);
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '12px';

    // 카드 헤더
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-header-t">${ev.period_label||''} 중간 보고</div>
          <div class="card-header-s">보고 ${reports.length}건 · 상급자에게 자유롭게 보고하세요</div>
        </div>
        <span class="bd bd-fb">작성 가능</span>
      </div>`;

    // 기존 보고 목록
    if (reports.length) {
      const listDiv = document.createElement('div');
      listDiv.style.marginBottom = '14px';
      reports.forEach((r, i) => {
        const entry = document.createElement('div');
        entry.className = 'fb-entry';
        entry.innerHTML = `
          <div class="fb-meta">
            <span class="bd bd-fb">보고 #${reports.length - i}</span>
            <span>${(r.created_at||'').slice(0,16).replace('T',' ')}</span>
          </div>
          <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;margin-bottom:6px">${r.content||''}</div>
          ${r.files?.length ? renderFileList(r.files) : ''}`;
        listDiv.appendChild(entry);
      });
      card.appendChild(listDiv);
    } else {
      const noRpt = document.createElement('div');
      noRpt.className = 'alert alert-orange';
      noRpt.style.marginBottom = '12px';
      noRpt.textContent = '아직 작성된 보고가 없습니다. 아래에서 첫 번째 보고를 작성해보세요.';
      card.appendChild(noRpt);
    }

    // 새 보고 작성 폼
    const formDiv = document.createElement('div');
    formDiv.style.cssText = 'border-top:1px solid var(--o100);padding-top:14px';

    const formTitle = document.createElement('div');
    formTitle.style.cssText = 'font-size:13px;font-weight:500;color:var(--o800);margin-bottom:10px';
    formTitle.textContent = reports.length ? '추가 보고 작성' : '중간 보고 작성';
    formDiv.appendChild(formTitle);

    // 목표별 진행 현황 입력란
    if (goals.length) {
      const goalsLabel = document.createElement('div');
      goalsLabel.style.cssText = 'font-size:12px;font-weight:500;color:var(--o600);margin-bottom:8px';
      goalsLabel.textContent = '목표별 진행 현황';
      formDiv.appendChild(goalsLabel);

      goals.forEach(g => {
        const row = document.createElement('div');
        row.style.marginBottom = '10px';
        row.innerHTML = `
          <label style="font-size:12px;font-weight:500;color:var(--o800);display:block;margin-bottom:3px">
            ${g.name}
            <span style="font-size:11px;color:var(--muted);font-weight:400"> (${g.weight}%)</span>
          </label>
          <textarea id="rpt-goal-${ev.id}-${g.id}"
            placeholder="${g.name}의 현재 진행 상황을 작성하세요..."
            style="width:100%;min-height:60px;resize:vertical"></textarea>`;
        formDiv.appendChild(row);
      });
    }

    // 종합의견 입력란
    const overallLabel = document.createElement('div');
    overallLabel.style.cssText = 'font-size:12px;font-weight:500;color:var(--o600);margin-bottom:4px;margin-top:4px';
    overallLabel.textContent = '중간보고 종합의견';
    formDiv.appendChild(overallLabel);

    const textarea = document.createElement('textarea');
    textarea.id = 'rpt-content-' + ev.id;
    textarea.placeholder = '전체적인 진행 상황, 이슈, 지원 요청 사항 등을 자유롭게 작성하세요...';
    textarea.style.cssText = 'width:100%;min-height:100px;resize:vertical';
    formDiv.appendChild(textarea);

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
    el.appendChild(card);
  }
}

/* ── 보고 조회 (승인자용) ── */
async function renderViewReports(evList) {
  const el = document.getElementById('rpt-view');
  if (!el) return;
  el.innerHTML = '';
  let hasAny = false;

  for (const ev of evList) {
    const reports = await API.get('/reports/' + ev.id).catch(() => []);
    if (!reports.length) continue;
    hasAny = true;

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '10px';
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <div>
          <span style="font-size:14px;font-weight:600">${ev.user_name||''}</span>
          <span style="font-size:12px;color:var(--muted);margin-left:8px">${ev.dept||''} · ${ev.period_label||''}</span>
        </div>
        <span class="bd bd-fb">보고 ${reports.length}건</span>
      </div>
      ${reports.map((r,i) => `
        <div class="fb-entry">
          <div class="fb-meta">
            <span class="bd bd-fb">보고 #${reports.length-i}</span>
            <span>${(r.created_at||'').slice(0,16).replace('T',' ')}</span>
          </div>
          <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;margin-bottom:6px">${r.content||''}</div>
          ${r.files?.length ? renderFileList(r.files) : ''}
        </div>`).join('')}`;
    el.appendChild(card);
  }

  if (!hasAny) {
    el.innerHTML = '<div class="alert alert-orange">조회 가능한 중간 보고가 없습니다.</div>';
  }
}

/* ── 보고 제출 ── */
async function submitReport(evalId, goals) {
  const overall = document.getElementById('rpt-content-' + evalId)?.value?.trim() || '';

  // 목표별 내용 수집
  const goalParts = (goals||[]).map(g => {
    const val = document.getElementById(`rpt-goal-${evalId}-${g.id}`)?.value?.trim() || '';
    return val ? `[${g.name}]\n${val}` : '';
  }).filter(Boolean);

  // 전체 content 구성
  const parts = [];
  if (goalParts.length) parts.push(goalParts.join('\n\n'));
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

/* ── 파일 첨부 위젯 ── */
function createFileWidget(widgetId) {
  const wrap = document.createElement('div');
  wrap.className = '_fw';
  wrap._files = [];
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0">
        📎 파일 첨부
        <input type="file" multiple style="display:none"
          onchange="handleRptFile('${widgetId}', this, event)">
      </label>
      <span style="font-size:11px;color:var(--muted)">최대 10MB · 여러 파일 가능</span>
    </div>
    <div id="rpt-filelist-${widgetId}" style="display:flex;flex-wrap:wrap;gap:5px"></div>`;
  return wrap;
}

function handleRptFile(widgetId, input) {
  const listEl = document.getElementById('rpt-filelist-' + widgetId);
  const wrap   = listEl?.closest('._fw');
  if (!listEl || !wrap) return;

  Array.from(input.files).forEach(file => {
    if (file.size > 10 * 1024 * 1024) {
      showAlert(file.name + '은 10MB를 초과합니다.', 'red'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      wrap._files = (wrap._files || []).concat([{
        name: file.name, data: e.target.result,
        type: file.type, size: file.size,
      }]);
      const tag = document.createElement('span');
      tag.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--o50);border:1px solid var(--o200);border-radius:12px;font-size:12px';
      tag.innerHTML = `📄 ${file.name} <span style="color:var(--muted)">(${(file.size/1024).toFixed(0)}KB)</span>
        <span onclick="this.closest('span').remove();wrap._files=wrap._files.filter(f=>f.name!=='${file.name}')"
          style="cursor:pointer;color:var(--red);margin-left:2px">×</span>`;
      listEl.appendChild(tag);
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

/* ── 파일 다운로드 ── */
async function downloadFile(fileId, fileName) {
  try {
    const res = await API.get('/files/' + fileId);
    const a = document.createElement('a');
    a.href = res.file_data;
    a.download = res.file_name || fileName;
    a.click();
  } catch(e) { showAlert('다운로드 실패: ' + e.message, 'red'); }
}

function renderFileList(files) {
  if (!files || !files.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
    ${files.map(f => `
      <span onclick="downloadFile(${f.id},'${f.file_name}')"
        style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;
          background:var(--o50);border:1px solid var(--o200);border-radius:12px;
          font-size:12px;cursor:pointer" title="클릭하여 다운로드">
        📄 ${f.file_name}
        <span style="color:var(--muted)">(${f.file_size?(f.file_size/1024).toFixed(0)+'KB':''})</span>
      </span>`).join('')}
  </div>`;
}
