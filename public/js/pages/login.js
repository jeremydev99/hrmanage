Pages = window.Pages || {};
Pages.login = function() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-header">
        <div class="login-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>
          </svg>
        </div>
        <div class="login-title">㈜사이냅소프트</div>
        <div class="login-sub">인사평가 시스템</div>
      </div>
      <div class="login-body">
        <div id="login-alert"></div>
        <div class="form-group" style="margin-bottom:12px">
          <label>이메일</label>
          <input type="email" id="l-email" placeholder="이메일 입력" value="dev3@synapsoft.com">
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>비밀번호</label>
          <input type="password" id="l-pw" placeholder="비밀번호 입력" value="user1234"
            onkeydown="if(event.key==='Enter')doLogin()">
        </div>
        <button class="btn btn-primary" style="width:100%;margin-bottom:10px" onclick="doLogin()">로그인</button>
        <button class="btn btn-ghost" style="width:100%;font-size:13px" onclick="showSignupModal()">신규 가입 신청</button>
        <div id="notice-container" style="display:none"></div>
      </div>
    </div>

    <div id="signup-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,.5);z-index:200;align-items:center;justify-content:center">
      <div style="background:var(--white);border-radius:16px;padding:28px;width:100%;
        max-width:440px;margin:20px;max-height:90vh;overflow-y:auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
          <div style="font-size:16px;font-weight:600">신규 가입 신청</div>
          <button onclick="hideSignupModal()"
            style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted);line-height:1">×</button>
        </div>
        <div id="signup-alert"></div>
        <div class="form-row">
          <div class="form-group">
            <label>이름 *</label>
            <input id="su-name" placeholder="홍길동">
          </div>
          <div class="form-group">
            <label>이메일 *</label>
            <input type="email" id="su-email" placeholder="hong@synapsoft.com">
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label>비밀번호 * (8자 이상)</label>
          <input type="password" id="su-pw" placeholder="비밀번호 입력">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>부서</label>
            <input id="su-dept" placeholder="개발팀">
          </div>
          <div class="form-group">
            <label>직책</label>
            <input id="su-title" placeholder="팀장, 선임 등">
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label>직급</label>
          <select id="su-grade-sel" style="height:36px;font-size:13px;width:100%"
            onchange="document.getElementById('su-grade-custom').style.display=this.value==='기타'?'':'none'">
            <option value="">선택하세요</option>
            <option>사원</option><option>대리</option><option>과장</option>
            <option>차장</option><option>부장</option><option>이사</option>
            <option>상무</option><option>전무</option><option>부사장</option>
            <option>사장</option><option>기타</option>
          </select>
          <input id="su-grade-custom" placeholder="직급 직접 입력"
            style="margin-top:6px;display:none">
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>가입 사유 (선택)</label>
          <textarea id="su-note" placeholder="가입 신청 사유를 간략히 작성하세요..."
            style="width:100%;min-height:72px;resize:vertical"></textarea>
        </div>
        <div class="alert alert-orange" style="font-size:12px;margin-bottom:14px">
          가입 신청 후 관리자 승인이 완료되면 로그인 가능합니다.
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" style="flex:1" onclick="hideSignupModal()">취소</button>
          <button class="btn btn-primary" style="flex:2" onclick="doSignup()">가입 신청</button>
        </div>
      </div>
    </div>`;
  loadNotice();
};

async function loadNotice() {
  try {
    const data = await fetch('/api/notice').then(r => r.json());
    const container = document.getElementById('notice-container');
    if (!container) return;
    if (!data.content) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    container.innerHTML = `
      <div style="background:var(--o50);border:1px solid var(--o200);border-radius:8px;padding:14px;margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:4px">
          <div style="font-size:12px;font-weight:600;color:var(--o600)">📢 공지사항</div>
          ${data.author_name ? `
          <div style="font-size:11px;color:var(--muted)">
            ${data.author_name} ${data.author_title||''} · ${(data.updated_at||'').slice(0,10)}
          </div>` : ''}
        </div>
        <div style="font-size:12px;color:var(--o800);white-space:pre-wrap;line-height:1.6;max-height:160px;overflow-y:auto">${data.content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      </div>`;
  } catch(e) {
    console.log('공지사항 로드 실패:', e.message);
  }
}

function showSignupModal() {
  const ov = document.getElementById('signup-overlay');
  ov.style.display = 'flex';
}
function hideSignupModal() {
  document.getElementById('signup-overlay').style.display = 'none';
  document.getElementById('signup-alert').innerHTML = '';
  ['su-name','su-email','su-pw','su-dept','su-title','su-grade-custom','su-note']
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const grSel = document.getElementById('su-grade-sel');
  if (grSel) { grSel.value = ''; document.getElementById('su-grade-custom').style.display='none'; }
}

async function doSignup() {
  const name  = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const pw    = document.getElementById('su-pw').value;
  const dept  = document.getElementById('su-dept').value.trim();
  const title = document.getElementById('su-title').value.trim();
  const grade = (() => {
    const sel = document.getElementById('su-grade-sel')?.value || '';
    const cus = document.getElementById('su-grade-custom')?.value.trim() || '';
    return sel === '기타' ? cus : sel;
  })();
  const note  = document.getElementById('su-note').value.trim();
  const alertEl = document.getElementById('signup-alert');

  if (!name || !email || !pw) {
    alertEl.innerHTML = '<div class="alert alert-red">이름, 이메일, 비밀번호는 필수입니다.</div>'; return;
  }
  if (pw.length < 8) {
    alertEl.innerHTML = '<div class="alert alert-red">비밀번호는 8자 이상이어야 합니다.</div>'; return;
  }
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pw, dept, grade, title, signup_note: note })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alertEl.innerHTML = '<div class="alert alert-green">가입 신청 완료! 관리자 승인 후 로그인 가능합니다.</div>';
    setTimeout(() => hideSignupModal(), 2500);
  } catch(e) {
    alertEl.innerHTML = `<div class="alert alert-red">${e.message}</div>`;
  }
}

async function doLogin() {
  const email   = document.getElementById('l-email').value.trim();
  const pw      = document.getElementById('l-pw').value;
  const alertEl = document.getElementById('login-alert');
  if (!email || !pw) {
    alertEl.innerHTML = '<div class="alert alert-red">이메일과 비밀번호를 입력하세요.</div>'; return;
  }
  try {
    await App.login(email, pw);
  } catch(e) {
    alertEl.innerHTML = `<div class="alert alert-red">${e.message}</div>`;
  }
}
