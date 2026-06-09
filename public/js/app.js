/* ── Pages 객체 초기화 (app.js가 login.js보다 먼저 로드되므로 여기서 먼저 생성) ── */
var Pages = window.Pages || {};

/* ── 앱 메인 라우터 ── */
const App = {
  user: null,
  categories: [],

  async init() {
    const token = getToken();
    if (token) {
      try {
        API.setToken(token);
        this.user = await API.get('/auth/me');
        this.categories = await API.get('/categories');
        this.render();
        this.navigate('my-eval');
        startSessionCheck();
      } catch { this.renderLogin(); }
    } else { this.renderLogin(); }
  },

  renderLogin() { document.getElementById('app').innerHTML = ''; Pages.login(); },

  async login(email, pw) {
    const data = await API.post('/auth/login', { email, password: pw });
    this.user = data.user;
    API.setToken(data.token);           // 토큰 먼저 설정 (이후 API 호출에 사용)
    this.categories = await API.get('/categories');
    await applySessionPolicy(data.token);
    this.render();
    updateNavForRole();                 // 관리자 메뉴 표시 갱신
    this.navigate('my-eval');
    startSessionCheck();
  },

  logout() {
    API.clearToken();
    sessionStorage.removeItem('synap_token');
    localStorage.removeItem('synap_token');
    localStorage.removeItem('synap_expire');
    this.user = null;
    document.getElementById('app').innerHTML = '';
    this.renderLogin();
  },

  isAdmin() { return ['master','admin'].includes(this.user?.role); },
  isMaster(){ return this.user?.role === 'master'; },

  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="topbar" style="display:flex;align-items:center;justify-content:space-between">
        <!-- 좌측: 햄버거 + 로고 -->
        <div style="display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden">
          <button id="hamburger-btn" class="hamburger-btn"
            style="display:none;background:none;border:none;cursor:pointer;padding:6px;
                   flex-direction:column;gap:5px;align-items:center;justify-content:center;flex-shrink:0"
            ontouchstart="event.preventDefault();toggleMobileMenu()"
            onclick="toggleMobileMenu()">
            <span style="display:block;width:22px;height:2px;background:white;border-radius:2px"></span>
            <span style="display:block;width:22px;height:2px;background:white;border-radius:2px"></span>
            <span style="display:block;width:22px;height:2px;background:white;border-radius:2px"></span>
          </button>
          <div class="topbar-logo" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            <span style="font-size:15px">㈜사이냅소프트</span>
            <span class="pc-only" style="font-size:12px;opacity:.8;margin-left:4px">인사평가 시스템</span>
          </div>
        </div>
        <!-- 가운데: PC 사용자 정보 -->
        <div class="topbar-user pc-only">
          <div id="nav-user-name" style="font-size:13px"></div>
          <button onclick="openPasswordChangeModal()" style="margin-right:4px;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.4)">비밀번호 변경</button>
          <button onclick="App.logout()">로그아웃</button>
        </div>
        <!-- 우측: 모바일 로그아웃 -->
        <div class="mobile-only" style="flex-shrink:0">
          <button class="btn btn-ghost btn-sm"
            style="color:white;border-color:rgba(255,255,255,.4);white-space:nowrap;font-size:13px"
            onclick="App.logout()">로그아웃</button>
        </div>

        <!-- PC 중앙 메뉴 (topbar 내부에서 position:absolute 중앙 정렬) -->
        <nav class="nav-tabs-wrap pc-only" style="gap:2px">

          <!-- 내 평가 -->
          <div class="nav-dropdown" style="position:relative">
            <button class="nav-tab nav-dd-btn" onclick="toggleNavDD('dd-myeval',event)"
              style="display:flex;align-items:center;gap:4px">
              내 평가 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
            </button>
            <div id="dd-myeval" class="nav-dd-menu">
              <div class="dd-item" onclick="closeNavDD();App.navigate('myEval')">📋 내 평가 홈</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('approvals')">목표 승인 관리</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('finalEval')">최종 평가</div>
            </div>
          </div>

          <!-- 성과관리 -->
          <div class="nav-dropdown" style="position:relative">
            <button class="nav-tab nav-dd-btn" onclick="toggleNavDD('dd-perf',event)"
              style="display:flex;align-items:center;gap:4px">
              성과관리 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
            </button>
            <div id="dd-perf" class="nav-dd-menu">
              <div class="dd-item" onclick="closeNavDD();App.navigate('perfHome')">📊 성과관리 홈</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('myReportFeedback')">📋 보고·피드백</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('okrDashboard')">🎯 OKR 현황</div>
            </div>
          </div>

          <!-- 관리자 설정 (admin+만) -->
          <div class="nav-dropdown admin-only" style="position:relative;display:none">
            <button class="nav-tab nav-dd-btn" onclick="toggleNavDD('dd-admin',event)"
              style="display:flex;align-items:center;gap:4px">
              관리자 설정 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
            </button>
            <div id="dd-admin" class="nav-dd-menu" style="right:0;left:auto">
              <div class="dd-section-label">평가 관리</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-accounts'),300)">계정 승인 관리</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-status'),300)">전직원 평가 현황</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-cat'),300)">목표 카테고리</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-periods'),300)">평가 기간 관리</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-grade-policies'),300)">등급 정책 관리</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-policy'),300)">평가 정책</div>
              <div class="dd-section-label">조직 / 권한</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-org'),300)">조직도 관리</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-orgtable'),300)">조직 관리</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-roles'),300)">권한 관리</div>
              <div class="dd-section-label">로그</div>
              <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-audit'),300)">감사 로그</div>
            </div>
          </div>

        </nav>
      </div>
      <div id="main-alert" style="padding:0 20px;max-width:900px;margin:0 auto"></div>
      <div class="main" id="main-area"></div>
    `;
    this.renderNav();
  },

  renderNav() {
    const u = this.user;
    document.getElementById('nav-user-name').innerHTML =
      `<span style="font-size:11px;opacity:.8">${u.dept||''} ${u.title||''}</span> ${u.name} ${roleBadge(u.role)}`;
    updateNavForRole();
  },

  navigate(page) {
    closeMobileMenu();
    closeNavDD();
    const area = document.getElementById('main-area');
    area.innerHTML = '<div class="spinner">로딩 중...</div>';
    console.log('[navigate]', page, 'Pages:', Object.keys(Pages));
    // 직접 처리 (P map에 등록되기 전에 navigate가 호출될 경우 대비)
    if (page === 'perfHome')     { if (Pages.perfHome)     Pages.perfHome();     else area.innerHTML = ''; return; }
    if (page === 'okrDashboard') { if (Pages.okrDashboard) Pages.okrDashboard(); else area.innerHTML = ''; return; }
    const P = {
      'my-eval':        Pages.myEval,
      'myEval':         Pages.myEval,
      'approvals':      Pages.approvals,
      'feedback':            Pages.feedback,
      'myReportFeedback':    Pages.myReportFeedback,
      'final':          Pages.finalEval,
      'finalEval':      Pages.finalEval,
      'admin':          Pages.admin,
      'okrDashboard':   Pages.okrDashboard,
      'perfHome':       Pages.perfHome,
    };
    if (P[page]) P[page]();
    else { console.warn('[navigate] 미등록 페이지:', page); area.innerHTML = ''; }
    if (typeof checkMissingPolicyBanner === 'function') checkMissingPolicyBanner();
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());

// 모바일 햄버거 메뉴 토글
function toggleMobileMenu() {
  let menu = document.getElementById('mobile-nav-menu');
  if (menu) { closeMobileMenu(); return; }

  const user = App.user;
  const isAdmin = App.isAdmin();

  const menuGroups = [
    {
      label: '내 평가',
      icon: '📋',
      navigate: 'my-eval',
      items: [
        { label: '내 평가 홈',  navigate: 'myEval'    },
        { label: '목표 승인 관리',   navigate: 'approvals' },
        { label: '최종 평가',   navigate: 'final'     },
      ]
    },
    {
      label: '성과관리',
      icon: '📊',
      navigate: 'perfHome',
      items: [
        { label: '성과관리 홈', navigate: 'perfHome'     },
        { label: '보고·피드백', navigate: 'myReportFeedback' },
        { label: '🎯 OKR 현황', navigate: 'okrDashboard' },
      ]
    },
  ];

  if (isAdmin) {
    menuGroups.push({
      label: '관리자 설정',
      icon: '⚙',
      navigate: 'admin',
      items: [
        { label: '계정 승인 관리',   tab: 'adm-accounts'  },
        { label: '전직원 평가 현황', tab: 'adm-status'    },
        { label: '목표 카테고리',    tab: 'adm-cat'       },
        { label: '평가 기간 관리',   tab: 'adm-periods'   },
        { label: '조직도 관리',      tab: 'adm-org'       },
        { label: '조직 관리',        tab: 'adm-orgtable'  },
        { label: '권한 관리',        tab: 'adm-roles'     },
        { label: '평가 정책',        tab: 'adm-policy'    },
        { label: '평가 등급',        tab: 'adm-grades'    },
        { label: '감사 로그',        tab: 'adm-audit'     },
      ]
    });
  }

  menu = document.createElement('div');
  menu.id = 'mobile-nav-menu';
  menu.style.cssText = 'position:fixed;top:52px;left:0;right:0;bottom:0;background:white;z-index:300;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,.2)';

  menu.innerHTML = `
    <div style="padding:16px;background:var(--o50);border-bottom:1px solid var(--o100)">
      <div style="font-size:15px;font-weight:700;color:var(--o800)">👤 ${user?.name||''}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${user?.dept||''} ${user?.title||''}</div>
      <div style="margin-top:6px">
        <span class="bd ${user?.role==='master'?'bd-locked':user?.role==='admin'?'bd-purple':'bd-approved'}" style="font-size:11px">
          ${user?.role==='master'?'마스터관리자':user?.role==='admin'?'관리자':'일반사용자'}
        </span>
      </div>
    </div>`;

  menuGroups.forEach((group, gi) => {
    const groupDiv = document.createElement('div');
    groupDiv.style.cssText = 'border-bottom:1px solid var(--o100)';

    // 그룹 헤더: 좌측(탭 이동) + 우측(아코디언 토글) 분리
    const groupHeader = document.createElement('div');
    groupHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--o100);background:white';

    // 좌측: 탭 이동 버튼
    const groupLabel = document.createElement('div');
    groupLabel.style.cssText = 'padding:14px 16px;font-size:14px;font-weight:600;color:var(--o800);cursor:pointer;flex:1;display:flex;align-items:center;gap:8px';
    groupLabel.innerHTML = `${group.icon} ${group.label}`;
    groupLabel.onclick = () => {
      closeMobileMenu();
      if (group.navigate) App.navigate(group.navigate);
    };

    // 우측: 아코디언 토글 버튼
    const groupToggle = document.createElement('div');
    groupToggle.style.cssText = 'padding:14px 16px;cursor:pointer;color:var(--muted);font-size:12px;border-left:1px solid var(--o100);display:flex;align-items:center;justify-content:center;min-width:44px';
    groupToggle.innerHTML = `<span class="menu-arrow-${gi}" style="transition:transform .2s;display:inline-block">▼</span>`;

    const subMenu = document.createElement('div');
    subMenu.id = `mobile-submenu-${gi}`;
    subMenu.style.cssText = 'display:none;background:var(--o50)';

    group.items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.style.cssText = 'padding:11px 16px 11px 32px;font-size:13px;color:var(--o700);cursor:pointer;border-top:1px solid var(--o100);display:flex;align-items:center;gap:8px';
      itemDiv.innerHTML = `<span style="color:var(--o300)">›</span> ${item.label}`;
      itemDiv.onclick = () => {
        closeMobileMenu();
        if (item.tab?.startsWith('adm-')) {
          App.navigate('admin');
          setTimeout(() => switchAdmTab(item.tab), 300);
        } else if (item.navigate) {
          App.navigate(item.navigate);
        } else if (item.tab) {
          App.navigate(item.tab);
        }
      };
      itemDiv.addEventListener('touchstart', () => { itemDiv.style.background = 'var(--o100)'; }, { passive: true });
      itemDiv.addEventListener('touchend',   () => { itemDiv.style.background = ''; });
      subMenu.appendChild(itemDiv);
    });

    groupToggle.onclick = () => {
      const isOpen = subMenu.style.display === 'block';
      const arrow = groupToggle.querySelector(`.menu-arrow-${gi}`);
      if (!isOpen) {
        // 펼치기
        subMenu.style.display = 'block';
        subMenu.style.overflow = 'hidden';
        subMenu.style.maxHeight = '0px';
        subMenu.style.opacity = '0';
        subMenu.style.transition = 'max-height 0.25s ease-out, opacity 0.2s ease-out';
        requestAnimationFrame(() => {
          subMenu.style.maxHeight = subMenu.scrollHeight + 'px';
          subMenu.style.opacity = '1';
        });
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      } else {
        // 접기
        subMenu.style.maxHeight = subMenu.scrollHeight + 'px';
        subMenu.style.transition = 'max-height 0.2s ease-in, opacity 0.15s ease-in';
        requestAnimationFrame(() => {
          subMenu.style.maxHeight = '0px';
          subMenu.style.opacity = '0';
        });
        setTimeout(() => { subMenu.style.display = 'none'; }, 220);
        if (arrow) arrow.style.transform = '';
      }
    };

    groupHeader.appendChild(groupLabel);
    groupHeader.appendChild(groupToggle);
    groupDiv.appendChild(groupHeader);
    groupDiv.appendChild(subMenu);
    menu.appendChild(groupDiv);
  });

  const pwChangeBtn = document.createElement('div');
  pwChangeBtn.style.cssText = 'padding:14px 16px;font-size:14px;color:#555;cursor:pointer;border-top:2px solid var(--o100);display:flex;align-items:center;gap:8px';
  pwChangeBtn.innerHTML = '🔑 비밀번호 변경';
  pwChangeBtn.onclick = () => { closeMobileMenu(); openPasswordChangeModal(); };
  menu.appendChild(pwChangeBtn);

  const logoutBtn = document.createElement('div');
  logoutBtn.style.cssText = 'padding:14px 16px;font-size:14px;color:#E53935;cursor:pointer;border-top:1px solid var(--o100);display:flex;align-items:center;gap:8px';
  logoutBtn.innerHTML = '🚪 로그아웃';
  logoutBtn.onclick = () => { closeMobileMenu(); App.logout(); };
  menu.appendChild(logoutBtn);

  const overlay = document.createElement('div');
  overlay.id = 'mobile-nav-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:299;background:transparent';
  overlay.onclick = closeMobileMenu;
  document.body.appendChild(overlay);
  document.body.appendChild(menu);
}

function closeMobileMenu() {
  document.getElementById('mobile-nav-menu')?.remove();
  document.getElementById('mobile-nav-overlay')?.remove();
}

// PC 드롭다운 메뉴
function toggleNavDD(id, e) {
  e?.stopPropagation();
  const target = document.getElementById(id);
  const isOpen = target?.classList.contains('open');
  closeNavDD();
  if (!isOpen && target) {
    target.classList.add('open');
    const btn   = target.previousElementSibling;
    const arrow = btn?.querySelector('.dd-arrow');
    if (arrow) arrow.style.transform = 'rotate(180deg)';
    setTimeout(() => {
      document.addEventListener('click', closeNavDD, { once: true });
    }, 300);
  }
}

function closeNavDD() {
  document.querySelectorAll('.nav-dd-menu').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.nav-dropdown .dd-arrow').forEach(a => a.style.transform = '');
}

// 하위 호환 별칭
const closeNavDropdown = closeNavDD;

function updateNavForRole() {
  const isAdmin = App.isAdmin();
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'block' : 'none';
  });
}

// OKR 현황 대시보드 (조회 전용)
Pages.okrDashboard = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const cycles = await API.get('/okr').catch(() => []);
    area.innerHTML = '';

    const header = document.createElement('div');
    header.style.marginBottom = '16px';
    header.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:var(--o800)">🎯 OKR 현황</div>
      <div style="font-size:12px;color:var(--muted)">전체 기간 OKR 달성률 (편집은 내 평가 탭에서)</div>`;
    area.appendChild(header);

    if (!cycles.length) {
      area.innerHTML += `<div class="card"><div class="alert alert-orange">
        작성된 OKR이 없습니다.
        <button class="btn btn-ghost btn-sm" style="margin-left:8px"
          onclick="App.navigate('myEval')">내 평가로 이동 →</button>
      </div></div>`;
      return;
    }

    cycles.forEach(cycle => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '12px';

      let totalKRs = 0, totalPct = 0;
      cycle.objectives.forEach(obj =>
        obj.key_results.forEach(kr => {
          totalKRs++;
          totalPct += kr.target_value > 0 ? (kr.current_value / kr.target_value) * 100 : 0;
        })
      );
      const avg = totalKRs > 0 ? Math.round(totalPct / totalKRs) : 0;
      const col = avg >= 70 ? 'var(--green)' : avg >= 40 ? 'var(--o500)' : '#E53935';

      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:15px;font-weight:600">${cycle.period_label}</div>
            <div style="font-size:12px;color:var(--muted)">${cycle.eval_year} · OKR</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:28px;font-weight:800;color:${col}">${avg}%</div>
            <div style="font-size:11px;color:var(--muted)">전체 달성률</div>
          </div>
        </div>
        <div style="background:var(--o100);border-radius:20px;height:10px;margin-bottom:16px">
          <div style="background:${col};border-radius:20px;height:100%;
                      width:${Math.min(avg,100)}%;transition:width .4s"></div>
        </div>
        ${cycle.objectives.map((obj, oi) => {
          const op = obj.key_results.length
            ? Math.round(obj.key_results.reduce((a,kr) =>
                a + (kr.target_value>0?(kr.current_value/kr.target_value)*100:0),0)
                / obj.key_results.length) : 0;
          const oc = op>=70?'var(--green)':op>=40?'var(--o500)':'#E53935';
          return `
          <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-size:13px;font-weight:600;color:var(--o800)">🎯 O${oi+1}. ${obj.title}</div>
              <span style="font-size:14px;font-weight:700;color:${oc}">${op}%</span>
            </div>
            ${obj.description?`<div style="font-size:12px;color:var(--muted);margin-bottom:8px">${obj.description}</div>`:''}
            ${obj.key_results.map((kr,ki) => {
              const kp = kr.target_value>0?Math.round((kr.current_value/kr.target_value)*100):0;
              const kc = kp>=70?'var(--green)':kp>=40?'var(--o500)':'#E53935';
              return `
              <div style="display:flex;align-items:center;gap:8px;padding:5px 0;
                          font-size:12px;border-top:1px solid var(--o50)">
                <span style="color:var(--muted);white-space:nowrap">KR${ki+1}</span>
                <span style="flex:1;color:var(--o700)">${kr.title}</span>
                <span style="color:var(--muted);white-space:nowrap">
                  ${kr.current_value}/${kr.target_value}${kr.unit}</span>
                <div style="width:80px;background:var(--o100);border-radius:10px;height:6px;flex-shrink:0">
                  <div style="background:${kc};border-radius:10px;height:100%;width:${Math.min(kp,100)}%"></div>
                </div>
                <span style="font-weight:700;color:${kc};width:36px;text-align:right">${kp}%</span>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}`;
      area.appendChild(card);
    });
  } catch(err) {
    area.innerHTML = `<div class="alert alert-red">오류: ${err.message}</div>`;
  }
};

Pages.perfHome = async function() {
  const area = document.getElementById('main-area');
  area.innerHTML = '<div class="spinner">로딩 중...</div>';
  try {
    const user = App.user;
    const isAdmin = ['master','admin'].includes(user?.role);

    const [mySummary, teamSummary, evalPeriods] = await Promise.all([
      API.get('/perf/my-summary').catch(() => []),
      API.get('/perf/team-summary').catch(() => ({ is_leader: false, teams: [] })),
      API.get('/eval-periods').catch(() => []),
    ]);

    area.innerHTML = '';

    const header = document.createElement('div');
    header.style.marginBottom = '16px';
    header.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--o800)">📊 성과관리 홈</div>
          <div style="font-size:12px;color:var(--muted)">기간별 성과 요약 및 AI 분석</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-primary btn-sm perf-view-btn" id="view-my" onclick="switchPerfView('my')">내 성과</button>
          ${teamSummary.is_leader ? `<button class="btn btn-ghost btn-sm perf-view-btn" id="view-team" onclick="switchPerfView('team')">우리 팀</button>` : ''}
          ${isAdmin || teamSummary.is_leader ? `<button class="btn btn-ghost btn-sm perf-view-btn" id="view-org" onclick="switchPerfView('org')">전체 조직 분석</button>` : ''}
        </div>
      </div>`;
    area.appendChild(header);

    const aiSection = document.createElement('div');
    aiSection.id = 'ai-summary-section';
    aiSection.className = 'card';
    aiSection.style.marginBottom = '12px';
    aiSection.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:14px;font-weight:600">🤖 AI 성과 요약</div>
        <button class="btn btn-ghost btn-sm" onclick="loadAISummary('personal')">요약 생성</button>
      </div>
      <div id="ai-summary-content" style="font-size:13px;color:var(--muted);line-height:1.8">
        '요약 생성' 버튼을 클릭하면 AI가 성과를 분석합니다.
      </div>`;
    area.appendChild(aiSection);

    const myView = document.createElement('div');
    myView.id = 'perf-view-my';
    myView.innerHTML = renderMyPerfView(mySummary, user);
    area.appendChild(myView);

    if (teamSummary.is_leader) {
      const teamView = document.createElement('div');
      teamView.id = 'perf-view-team';
      teamView.style.display = 'none';
      teamView.innerHTML = renderTeamPerfView(teamSummary);
      area.appendChild(teamView);
    }

    if (isAdmin || teamSummary.is_leader) {
      const orgView = document.createElement('div');
      orgView.id = 'perf-view-org';
      orgView.style.display = 'none';
      orgView.innerHTML = renderOrgViewHTML(evalPeriods);
      area.appendChild(orgView);
    }

    window._perfData = { mySummary, teamSummary, user, evalPeriods };
  } catch(err) {
    area.innerHTML = `<div class="alert alert-red">오류: ${err.message}</div>`;
  }
};

function renderMyPerfView(summary, user) {
  if (!summary.length) {
    return `<div class="card"><div class="alert alert-orange">활성화된 평가 기간이 없습니다.</div></div>`;
  }
  return summary.map(s => {
    const score = s.eval_mode === 'OKR' ? s.okr_avg : s.mbo_score;
    const scoreLabel = s.eval_mode === 'OKR' ? '달성률' : '최종 점수';
    const scoreColor = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--o500)' : '#E53935';
    return `
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div>
          <div style="font-size:15px;font-weight:600">${s.period_label}</div>
          <div style="font-size:12px;color:var(--muted)">
            ${s.eval_year} ·
            <span class="bd bd-${s.eval_mode==='OKR'?'teal':'approved'}" style="font-size:10px">${s.eval_mode}</span>
          </div>
        </div>
        <div style="display:flex;gap:16px;align-items:center">
          ${score !== null ? `
          <div style="text-align:center">
            <div style="font-size:24px;font-weight:800;color:${scoreColor}">${score}${s.eval_mode==='OKR'?'%':'점'}</div>
            <div style="font-size:11px;color:var(--muted)">${scoreLabel}</div>
          </div>` : ''}
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:700;color:var(--o500)">${s.report_count}건</div>
            <div style="font-size:11px;color:var(--muted)">중간 보고</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:700;color:var(--o500)">${s.feedback_count}건</div>
            <div style="font-size:11px;color:var(--muted)">받은 피드백</div>
          </div>
        </div>
      </div>
      ${score !== null ? `
      <div style="background:var(--o100);border-radius:20px;height:8px">
        <div style="background:${scoreColor};border-radius:20px;height:100%;
                    width:${Math.min(s.eval_mode==='OKR'?score:score/5*100,100)}%;transition:width .4s"></div>
      </div>` : ''}
    </div>`;
  }).join('');
}

function renderTeamPerfView(teamData) {
  if (!teamData.teams.length) {
    return `<div class="card"><div class="alert alert-orange">팀 데이터가 없습니다.</div></div>`;
  }
  return `
    <div style="font-size:14px;font-weight:600;color:var(--o800);margin-bottom:10px">${teamData.org_name} 팀 현황</div>
    ${teamData.teams.map(t => `
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div>
          <div style="font-size:15px;font-weight:600">${t.period_label}</div>
          <div style="font-size:12px;color:var(--muted)">
            팀원 ${t.member_count}명 ·
            <span class="bd bd-${t.eval_mode==='OKR'?'teal':'approved'}" style="font-size:10px">${t.eval_mode}</span>
          </div>
        </div>
        ${t.team_avg_score !== null || t.team_okr_avg !== null ? `
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:800;color:var(--o500)">
            ${t.eval_mode==='OKR'?(t.team_okr_avg||0)+'%':(t.team_avg_score||0)+'점'}
          </div>
          <div style="font-size:11px;color:var(--muted)">팀 평균</div>
        </div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${t.members.map(m => {
          const score = t.eval_mode==='OKR' ? m.okr_avg : m.final_score;
          const pct = score !== null ? (t.eval_mode==='OKR' ? score : score/5*100) : 0;
          const col = pct>=70?'var(--green)':pct>=50?'var(--o500)':'#E53935';
          return `
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;min-width:80px;color:var(--o700)">${m.name} ${m.title||''}</span>
            <div style="flex:1;background:var(--o100);border-radius:10px;height:6px">
              <div style="background:${col};border-radius:10px;height:100%;width:${Math.min(pct,100)}%;transition:width .4s"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:${col};min-width:40px;text-align:right">
              ${score !== null ? (t.eval_mode==='OKR' ? score+'%' : score+'점') : '-'}
            </span>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('')}`;
}

/* ── 평가 기간 정렬 헬퍼 (전역, 여러 화면에서 재사용) ── */
function periodSortKey(p) {
  const year = parseInt(((p.eval_year || p.period_label || '')).match(/(\d{4})/)?.[1] || 0);
  const label = p.period_label || '';
  let endMonth = 0, typeOrder = 1;
  if (label.includes('하반기'))      { endMonth = 12; typeOrder = 0; }
  else if (label.includes('4분기'))  { endMonth = 12; typeOrder = 1; }
  else if (label.includes('3분기'))  { endMonth =  9; typeOrder = 1; }
  else if (label.includes('상반기')) { endMonth =  6; typeOrder = 0; }
  else if (label.includes('2분기'))  { endMonth =  6; typeOrder = 1; }
  else if (label.includes('1분기'))  { endMonth =  3; typeOrder = 1; }
  return year * 100000 + endMonth * 10 + (10 - typeOrder);
}
function sortPeriodsDesc(periods) {
  return [...(periods || [])].sort((a, b) => periodSortKey(b) - periodSortKey(a));
}

function switchPerfView(view) {
  ['my','team','org'].forEach(v => {
    const el  = document.getElementById('perf-view-'+v);
    const btn = document.getElementById('view-'+v);
    if (el)  el.style.display  = v===view ? 'block' : 'none';
    if (btn) { btn.classList.toggle('btn-primary', v===view); btn.classList.toggle('btn-ghost', v!==view); }
  });
  // 전체 조직 뷰는 자체 AI 섹션을 사용하므로 상단 AI 섹션 숨김
  const aiSection = document.getElementById('ai-summary-section');
  if (aiSection) aiSection.style.display = view === 'org' ? 'none' : '';
  const aiBtn = document.querySelector('#ai-summary-section button');
  if (aiBtn) aiBtn.onclick = () => loadAISummary(view === 'my' ? 'personal' : 'team');
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
    const summaryEl = document.createElement('div');
    summaryEl.style.cssText = 'white-space:pre-wrap;line-height:1.8;color:var(--o800)';
    summaryEl.textContent = r.summary;

    const noticeEl = document.createElement('div');
    noticeEl.style.cssText = 'font-size:11px;color:var(--muted);margin-top:8px';
    noticeEl.textContent = 'AI 분석 결과는 참고용입니다. 실제 평가와 다를 수 있습니다.';

    content.innerHTML = '';
    content.appendChild(summaryEl);
    content.appendChild(noticeEl);
  } catch(e) {
    content.innerHTML = `<div style="color:#E53935;font-size:13px">AI 요약 생성 실패: ${e.message}</div>`;
  }
}

// 세션 관리
function getToken() {
  return localStorage.getItem('synap_token') || sessionStorage.getItem('synap_token');
}

async function applySessionPolicy(token) {
  try {
    const policy = await fetch('/api/settings/session-policy', {
      headers: { Authorization: 'Bearer ' + token }
    }).then(r => r.json());
    if (policy.close_on_browser_close) {
      sessionStorage.setItem('synap_token', token);
      localStorage.removeItem('synap_token');
    } else {
      localStorage.setItem('synap_token', token);
      sessionStorage.removeItem('synap_token');
    }
    if (policy.timeout_minutes && policy.timeout_minutes < 480) {
      localStorage.setItem('synap_expire', (Date.now() + policy.timeout_minutes * 60 * 1000).toString());
    } else {
      localStorage.removeItem('synap_expire');
    }
  } catch(e) {
    localStorage.setItem('synap_token', token);
  }
}

function startSessionCheck() {
  setInterval(() => {
    const exp = localStorage.getItem('synap_expire');
    if (exp && Date.now() > parseInt(exp)) {
      localStorage.removeItem('synap_token');
      localStorage.removeItem('synap_expire');
      sessionStorage.removeItem('synap_token');
      showAlert('세션이 만료되었습니다. 다시 로그인해주세요.', 'orange');
      setTimeout(() => App.logout(), 1500);
    }
  }, 60 * 1000);
}

// ── 비밀번호 변경 모달 ────────────────────────────────────
function openPasswordChangeModal() {
  if (document.getElementById('pw-change-modal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'pw-change-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:28px 32px;width:340px;max-width:92vw;box-shadow:0 8px 32px rgba(0,0,0,.18)">
      <h3 style="margin:0 0 20px;font-size:17px;color:#222">🔑 비밀번호 변경</h3>
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:13px;color:#555;margin-bottom:5px">현재 비밀번호</label>
        <input type="password" id="pw-current" autocomplete="current-password"
          style="width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ddd;border-radius:7px;font-size:14px">
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:13px;color:#555;margin-bottom:5px">새 비밀번호</label>
        <input type="password" id="pw-new" autocomplete="new-password"
          style="width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ddd;border-radius:7px;font-size:14px">
        <div style="font-size:11px;color:#888;margin-top:4px">최소 8자, 영문·숫자·특수문자 중 2종 이상</div>
      </div>
      <div style="margin-bottom:18px">
        <label style="display:block;font-size:13px;color:#555;margin-bottom:5px">새 비밀번호 확인</label>
        <input type="password" id="pw-confirm" autocomplete="new-password"
          style="width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ddd;border-radius:7px;font-size:14px">
      </div>
      <div id="pw-error" style="display:none;color:#E53935;font-size:13px;margin-bottom:12px;padding:8px 10px;background:#fff0f0;border-radius:6px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="closePasswordChangeModal()"
          style="padding:9px 18px;border:1px solid #ddd;border-radius:7px;background:#f5f5f5;cursor:pointer;font-size:14px">취소</button>
        <button onclick="submitPasswordChange()"
          style="padding:9px 18px;border:none;border-radius:7px;background:var(--primary,#F07820);color:#fff;cursor:pointer;font-size:14px;font-weight:600">변경하기</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closePasswordChangeModal(); });
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('pw-current')?.focus(), 50);
}

function closePasswordChangeModal() {
  document.getElementById('pw-change-modal')?.remove();
}

// ── 전체 조직 분석 (PROMPT 58) ────────────────────────────
function renderOrgViewHTML(periods) {
  const isAdmin = ['master','admin'].includes(window._perfData?.user?.role);
  const allSorted = Array.isArray(periods) ? [...periods].sort((a,b) => {
    if (a.eval_year !== b.eval_year) return a.eval_year < b.eval_year ? -1 : 1;
    return a.period_label < b.period_label ? -1 : 1;
  }) : [];
  const sp = allSorted;
  const defFromId = sp.length > 8 ? sp[sp.length - 8].id : (sp[0]?.id || '');
  const defToId   = sp[sp.length - 1]?.id || '';
  const opts = (arr, selId) => arr.map(q =>
    `<option value="${q.id}"${q.id == selId ? ' selected' : ''}>${q.period_label}${!q.is_active ? ' (비활성)' : ''}</option>`
  ).join('');
  const inactiveRow = isAdmin ? `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;user-select:none;flex-shrink:0;white-space:nowrap">
          <input type="checkbox" id="include-inactive-check" onchange="reloadOrgPeriods()">
          <span style="white-space:nowrap">비활성 기간 포함</span>
        </label>
        <span style="font-size:11px;color:var(--muted)">관리자 전용 — 비활성 기간 통계 분석</span>
      </div>` : '';
  return `
    <div class="card" id="org-ai-summary-card" style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">🤖 조직 AI 요약</div>
      <div id="org-ai-summary-body">
        <div style="padding:14px;text-align:center;color:var(--muted);background:var(--o50);border-radius:6px;font-size:13px;line-height:1.7">
          📊 먼저 아래 <strong>"전체 조직 분석"</strong>에서 기간을 선택하고 <strong>"분석 로드"</strong>를 실행하면 AI 요약을 사용할 수 있습니다.
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:14px;font-weight:600;color:var(--o800);margin-bottom:12px">📈 전체 조직 분석</div>
      <div style="display:flex;flex-wrap:nowrap;gap:8px;align-items:center;margin-bottom:10px;overflow:hidden">
        <span style="font-size:13px;color:var(--o700);flex-shrink:0">기간:</span>
        <select id="org-period-from" style="font-size:13px;padding:4px 8px;border:1px solid var(--o200);border-radius:6px;flex:1 1 0;min-width:0;max-width:220px">${opts(sp, defFromId)}</select>
        <span style="font-size:13px;color:var(--o700);flex-shrink:0">~</span>
        <select id="org-period-to" style="font-size:13px;padding:4px 8px;border:1px solid var(--o200);border-radius:6px;flex:1 1 0;min-width:0;max-width:220px">${opts(sp, defToId)}</select>
        <span style="font-size:11px;color:var(--muted);flex-shrink:0">(최대 8개 기간)</span>
      </div>
      ${inactiveRow}
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span style="font-size:13px;color:var(--o700)">조직 깊이:</span>
        <select id="org-max-depth" style="font-size:13px;padding:4px 8px;border:1px solid var(--o200);border-radius:6px">
          <option value="0">회사만</option><option value="1">1단계</option>
          <option value="2">2단계</option><option value="999" selected>전체</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="loadOrgAnalysis()">분석 로드</button>
      </div>
      <!-- 환산 옵션 컨트롤 -->
      <div style="margin-top:10px;padding:10px 12px;background:var(--o50);border:1px solid var(--o100);border-radius:6px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="convToggle" onchange="onConvToggle()">
          <strong>현재 cutoff 기준으로 환산 분석</strong>
        </label>
        <div id="convPolicySelect" style="display:none;align-items:center;gap:6px">
          <span style="font-size:12px;color:var(--muted)">환산 기준:</span>
          <select id="convPolicyId" style="font-size:13px;padding:3px 6px;border:1px solid var(--o200);border-radius:4px" onchange="refreshConvTable()"></select>
        </div>
        <div style="margin-left:auto;font-size:11px;color:var(--muted)">📌 저장된 등급은 영구 보존됩니다. 환산은 표시용 가상 산출입니다.</div>
      </div>
    </div>
    <div id="org-analysis-result">
      <div class="card"><div class="alert alert-teal" style="font-size:13px">기간과 조직 깊이를 선택한 후 "분석 로드" 버튼을 클릭하세요.</div></div>
    </div>`;
}

function reloadOrgPeriods() {
  const includeInactive = document.getElementById('include-inactive-check')?.checked || false;
  const allPeriods = window._perfData?.evalPeriods || [];
  const sorted = [...allPeriods]
    .sort((a,b) => {
      if (a.eval_year !== b.eval_year) return a.eval_year < b.eval_year ? -1 : 1;
      return a.period_label < b.period_label ? -1 : 1;
    });
  const fromEl = document.getElementById('org-period-from');
  const toEl   = document.getElementById('org-period-to');
  if (!fromEl || !toEl) return;
  const opts = sorted.map(q =>
    `<option value="${q.id}">${q.period_label}${!q.is_active ? ' (비활성)' : ''}</option>`
  ).join('');
  fromEl.innerHTML = opts;
  toEl.innerHTML = opts;
  if (sorted.length) {
    fromEl.value = sorted.length > 8 ? sorted[sorted.length - 8].id : sorted[0].id;
    toEl.value = sorted[sorted.length - 1].id;
  }
}

async function loadOrgAnalysis() {
  const fromEl = document.getElementById('org-period-from');
  const toEl   = document.getElementById('org-period-to');
  const depEl  = document.getElementById('org-max-depth');
  const resEl  = document.getElementById('org-analysis-result');
  if (!fromEl || !toEl || !resEl) return;
  const fromId = parseInt(fromEl.value), toId = parseInt(toEl.value);
  const maxDep = parseInt(depEl?.value) || 999;
  const includeInactive = document.getElementById('include-inactive-check')?.checked || false;
  const allPeriods = [...(window._perfData?.evalPeriods || [])]
    .sort((a,b) => {
      if (a.eval_year !== b.eval_year) return a.eval_year < b.eval_year ? -1 : 1;
      return a.period_label < b.period_label ? -1 : 1;
    });
  const fromIdx = allPeriods.findIndex(p => p.id === fromId);
  const toIdx   = allPeriods.findIndex(p => p.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx > toIdx) {
    resEl.innerHTML = '<div class="card"><div class="alert alert-red">시작 기간이 종료 기간보다 늦습니다.</div></div>';
    return;
  }
  const ep = allPeriods.slice(fromIdx, toIdx + 1);
  if (ep.length > 8) {
    resEl.innerHTML = '<div class="card"><div class="alert alert-red">최대 8개 기간까지 선택 가능합니다. 범위를 좁혀주세요.</div></div>';
    return;
  }
  if (!ep.length) {
    resEl.innerHTML = '<div class="card"><div class="alert alert-orange">선택한 범위에 유효한 기간이 없습니다.</div></div>';
    return;
  }
  resEl.innerHTML = '<div class="spinner" style="padding:20px">분석 중...</div>';
  try {
    const pIds = ep.map(p => p.id).join(',');
    const [orgTree, trend, empGrades] = await Promise.all([
      API.get(`/perf/org-tree?period_ids=${pIds}&max_depth=${maxDep}&include_inactive=${includeInactive}`),
      API.get(`/perf/quarterly-trend?period_ids=${pIds}&include_inactive=${includeInactive}`),
      API.get(`/perf/employee-grades?period_ids=${pIds}&include_inactive=${includeInactive}`).catch(() => null),
    ]);
    window._orgData = { orgTree, trend, fromId, toId, pIds, includeInactive };
    window._empGradeData = empGrades;
    window._policyCache = {};
    if (empGrades?.available_policies) {
      empGrades.available_policies.forEach(p => { window._policyCache[p.id] = p.criteria; });
      // 환산 드롭다운 갱신
      const sel = document.getElementById('convPolicyId');
      if (sel) {
        sel.innerHTML = empGrades.available_policies.map(p =>
          `<option value="${p.id}"${p.id === empGrades.active_policy_id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
        ).join('');
      }
    }
    renderOrgAnalysisResult(orgTree, trend);
  } catch(err) {
    resEl.innerHTML = `<div class="card"><div class="alert alert-red">오류: ${err.message}</div></div>`;
  }
}

function renderOrgAnalysisResult(orgTree, trend) {
  const resEl = document.getElementById('org-analysis-result');
  if (!resEl) return;
  const { company, orgs = [], grade_codes = [] } = orgTree;

  const scoreBar = (avg, max) => {
    if (avg === null) return '<span style="color:var(--muted);font-size:12px">-</span>';
    const pct = Math.round(avg / max * 100);
    const col = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--o500)' : '#E53935';
    return `<div style="display:flex;align-items:center;gap:6px">
      <div style="width:50px;background:var(--o100);border-radius:6px;height:5px">
        <div style="background:${col};border-radius:6px;height:100%;width:${pct}%"></div>
      </div>
      <span style="font-size:12px;font-weight:600;color:${col}">${(+avg).toFixed(2)}점</span>
    </div>`;
  };

  const coHtml = company ? `
    <div class="card" style="margin-bottom:12px;background:linear-gradient(135deg,var(--o50),#fff)">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--o800)">🏢 ${company.name}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">
            총 ${company.total_members}명 · 평가 완료 ${company.evaluated_members}/${company.expected_total}
            (${company.completion_rate ?? 0}%)
          </div>
        </div>
        ${company.avg_score !== null ? `
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:800;color:var(--o600)">${(+company.avg_score).toFixed(2)}점</div>
          <div style="font-size:11px;color:var(--muted)">평균 점수 (100점)</div>
        </div>` : '<span style="color:var(--muted);font-size:13px">평가 데이터 없음</span>'}
      </div>
      ${Object.keys(company.grade_distribution||{}).length ? `
      <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
        ${grade_codes.filter(g => (company.grade_distribution||{})[g] != null).map(g =>
          `<span style="background:var(--o100);padding:3px 8px;border-radius:12px;font-size:12px"><b>${g}</b> ${company.grade_distribution[g]||0}명</span>`
        ).join('')}
      </div>` : ''}
    </div>` : '';

  const orgHtml = `
    <div class="card" style="margin-bottom:12px;overflow-x:auto">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">조직별 현황</div>
      ${orgs.length ? `<table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="border-bottom:2px solid var(--o200)">
          <th style="text-align:left;padding:6px 8px;color:var(--muted)">조직</th>
          <th style="text-align:center;padding:6px 8px;color:var(--muted)">직접 인원</th>
          <th style="text-align:center;padding:6px 8px;color:var(--muted)">평가완료</th>
          <th style="text-align:left;padding:6px 8px;color:var(--muted)">평균 점수</th>
        </tr></thead>
        <tbody>${orgs.map(o => `
          <tr style="border-bottom:1px solid var(--o100)">
            <td style="padding:6px 8px 6px ${8 + o.depth * 16}px">
              ${o.depth > 0 ? '<span style="color:var(--o300);margin-right:2px">└</span>' : ''}
              <span style="font-weight:${o.depth===0?600:400}">${o.name}</span>
              ${o.leader_name ? `<span style="font-size:11px;color:var(--muted);margin-left:4px">(${o.leader_name})</span>` : ''}
            </td>
            <td style="text-align:center;padding:6px 8px">${o.direct_members}</td>
            <td style="text-align:center;padding:6px 8px">${o.evaluated_members}/${o.expected_total}<span style="font-size:10px;color:var(--muted)"> (${o.completion_rate ?? 0}%)</span></td>
            <td style="padding:6px 8px">${scoreBar(o.avg_score, o.avg_score_max)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div class="alert alert-orange" style="font-size:12px">조직 데이터가 없습니다.</div>'}
    </div>`;

  const hasTrend = trend?.periods?.length > 0;
  const chartHtml = hasTrend ? `
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <div style="font-size:13px;font-weight:600">분기별 추이</div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-primary btn-sm" id="chart-btn-line" onclick="switchOrgChartType('line')">라인</button>
          <button class="btn btn-ghost btn-sm" id="chart-btn-bar" onclick="switchOrgChartType('bar')">바</button>
          <button class="btn btn-ghost btn-sm" id="chart-btn-heatmap" onclick="switchOrgChartType('heatmap')">히트맵</button>
        </div>
      </div>
      <div id="org-chart-container">
        <canvas id="org-trend-chart" style="max-height:220px"></canvas>
      </div>
    </div>` : '';

  resEl.innerHTML = coHtml + orgHtml + chartHtml;

  // AI 요약 카드 활성화 (최상단 카드 → 활성 상태로 갱신)
  const aiSummaryBody = document.getElementById('org-ai-summary-body');
  if (aiSummaryBody) {
    aiSummaryBody.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px">
        <span style="font-size:13px;color:var(--o700)">요약 수준:</span>
        <select id="ai-summary-level" style="font-size:13px;padding:4px 8px;border:1px solid var(--o200);border-radius:6px">
          <option value="summary">요약 (10줄, 약 5초)</option>
          <option value="detailed">상세 요약 (20~30줄, 약 15초)</option>
          <option value="comprehensive">상세 분석 (50줄+, 약 30초)</option>
        </select>
        <button id="org-ai-btn" class="btn btn-ghost btn-sm" onclick="generateOrgAISummary()">AI 요약 생성</button>
      </div>
      <div id="org-ai-result" style="font-size:13px;color:var(--muted);line-height:1.7">
        요약 수준을 선택한 후 "AI 요약 생성" 버튼을 클릭하세요.
      </div>`;
  }
  if (hasTrend) requestAnimationFrame(() => { window._orgTrendData = trend; renderOrgChart(trend, 'line'); });
}

function renderOrgChart(trendData, type) {
  if (type === 'heatmap') { renderOrgHeatmap(); return; }
  if (typeof Chart === 'undefined') {
    const c = document.getElementById('org-chart-container');
    if (c) c.innerHTML = '<div class="alert alert-orange" style="font-size:12px">Chart.js 라이브러리를 로드하지 못했습니다.</div>';
    return;
  }
  const container = document.getElementById('org-chart-container');
  if (!container) return;
  container.innerHTML = '<canvas id="org-trend-chart" style="max-height:220px"></canvas>';
  const canvas = document.getElementById('org-trend-chart');
  if (!canvas) return;
  if (window._orgChart) { try { window._orgChart.destroy(); } catch(e) {} window._orgChart = null; }
  const labels  = trendData.periods.map(p => p.label);
  const scores  = trendData.periods.map(p => p.avg_score);
  const maxScore = trendData.max_score || 100;
  window._orgChart = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [{ label: `${trendData.org_name||'전체'} 평균 점수`, data: scores,
        borderColor: '#F07820', backgroundColor: type === 'bar' ? 'rgba(240,120,32,0.65)' : 'rgba(240,120,32,0.12)',
        fill: type === 'line', tension: 0.35, pointBackgroundColor: '#F07820', pointRadius: 4 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: maxScore, title: { display: true, text: `점수 (/${maxScore})` } } } }
  });
}

async function renderOrgHeatmap() {
  const container = document.getElementById('org-chart-container');
  if (!container) return;
  const d = window._orgData;
  if (!d) return;
  container.innerHTML = '<div class="spinner" style="font-size:12px;padding:10px">히트맵 로드 중...</div>';
  try {
    const data = await API.get(`/perf/grade-distribution?period_ids=${d.pIds}&include_inactive=${d.includeInactive || false}`);
    const maxCnt = Math.max(...data.matrix.flat(), 1);
    const gradeRgb = [[45,164,78],[87,171,90],[240,120,32],[240,180,41],[229,57,53],[198,40,40]];
    let html = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;min-width:300px">
      <thead><tr><th style="padding:4px 8px;color:var(--muted)">등급</th>
      ${data.periods.map(p => `<th style="padding:4px 8px;color:var(--muted);white-space:nowrap;font-weight:400">${p}</th>`).join('')}
      </tr></thead><tbody>
      ${data.grades.map((g, gi) => {
        const [r, gv, b] = gradeRgb[gi] || [108, 117, 125];
        return `<tr><td style="padding:4px 8px;font-weight:700">${g}</td>
        ${data.matrix[gi].map(cnt => {
          const alpha = cnt > 0 ? (0.15 + (cnt/maxCnt)*0.70).toFixed(2) : '0.06';
          return `<td style="padding:6px 10px;text-align:center;background:rgba(${r},${gv},${b},${alpha});border-radius:3px">
            <span style="font-weight:${cnt>0?'600':'300'};color:${cnt>0?'#333':'var(--muted)'}">${cnt > 0 ? cnt : '-'}</span>
          </td>`;
        }).join('')}</tr>`;
      }).join('')}
      </tbody></table></div>`;
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div class="alert alert-orange" style="font-size:12px">히트맵 로드 실패: ${e.message}</div>`;
  }
}

function switchOrgChartType(type) {
  ['line','bar','heatmap'].forEach(t => {
    const btn = document.getElementById('chart-btn-'+t);
    if (btn) { btn.classList.toggle('btn-primary', t===type); btn.classList.toggle('btn-ghost', t!==type); }
  });
  if (window._orgTrendData) renderOrgChart(window._orgTrendData, type);
}

async function generateOrgAISummary() {
  const resEl  = document.getElementById('org-ai-result');
  const btn    = document.getElementById('org-ai-btn');
  const fromEl = document.getElementById('org-period-from');
  const toEl   = document.getElementById('org-period-to');
  if (!resEl || !fromEl || !toEl) return;
  const level = document.getElementById('ai-summary-level')?.value || 'summary';
  const pIds  = window._orgData?.pIds || `${fromEl.value},${toEl.value}`;
  const inclInactive = window._orgData?.includeInactive || false;
  const cacheKey = `${pIds}|${inclInactive}|${level}`;
  if (window._aiSummaryCache?.[cacheKey]) {
    renderAISummaryByLevel(window._aiSummaryCache[cacheKey], level, resEl);
    return;
  }
  const timeHint = { summary: '약 5초', detailed: '약 15초', comprehensive: '약 30초' }[level] || '';
  resEl.innerHTML = `<div class="spinner" style="font-size:13px">AI 분석 중... (${timeHint})</div>`;
  if (btn) { btn.disabled = true; btn.textContent = `생성 중...`; }
  try {
    const r = await API.post('/perf/org-ai-summary', {
      period_ids: pIds,
      include_inactive: inclInactive,
      level
    });
    if (!window._aiSummaryCache) window._aiSummaryCache = {};
    window._aiSummaryCache[cacheKey] = r;
    renderAISummaryByLevel(r, level, resEl);
  } catch(e) {
    resEl.innerHTML = `<div style="color:#E53935;font-size:13px">AI 요약 생성 실패: ${e.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'AI 요약 생성'; }
  }
}

function renderAISummaryByLevel(r, level, resEl) {
  if (!resEl) return;
  const footer = `<div style="font-size:11px;color:var(--muted);margin-top:10px">생성: ${new Date(r.generated_at).toLocaleString('ko-KR')} · AI 결과는 참고용입니다.</div>`;
  const s = r.structured || {};
  const raw = r.summary || '';
  if (!r.structured) {
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'color:#E53935;font-size:12px;margin-bottom:6px';
    errDiv.textContent = '⚠️ AI 응답 형식 오류, 원본 텍스트로 표시합니다.';
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;line-height:1.6;color:var(--o800);font-size:12px';
    pre.textContent = raw;
    resEl.innerHTML = footer;
    resEl.prepend(pre);
    resEl.prepend(errDiv);
    return;
  }
  if (level === 'summary') {
    const parts = [];
    if (s.overall)           parts.push(`<div class="ai-section"><b>📊 전체 요약</b><br>${s.overall}</div>`);
    if (s.strengths?.length) parts.push(`<div class="ai-section"><b>💪 강점 부서</b><br>${(Array.isArray(s.strengths[0]) || typeof s.strengths[0]==='string' ? s.strengths : s.strengths.map(x=>x.dept+': '+x.detail)).map(x=>'• '+x).join('<br>')}</div>`);
    if (s.weaknesses?.length) parts.push(`<div class="ai-section"><b>⚠️ 약점 부서</b><br>${(Array.isArray(s.weaknesses[0]) || typeof s.weaknesses[0]==='string' ? s.weaknesses : s.weaknesses.map(x=>x.dept+': '+x.detail)).map(x=>'• '+x).join('<br>')}</div>`);
    if (s.trend)             parts.push(`<div class="ai-section"><b>📈 트렌드</b><br>${s.trend}</div>`);
    if (s.actions?.length)   parts.push(`<div class="ai-section"><b>🎯 액션 아이템</b><br>${(typeof s.actions[0]==='string' ? s.actions : s.actions.map(x=>x.action||JSON.stringify(x))).map(x=>'• '+x).join('<br>')}</div>`);
    resEl.innerHTML = `<div style="line-height:1.8">${parts.join('')}${footer}</div>`;
  } else if (level === 'detailed') {
    const strList = (s.strengths||[]).map(x => typeof x==='string' ? `<div class="dept-item">• ${x}</div>` : `<div class="dept-item"><b>${x.dept||''}</b>: ${x.detail||''}</div>`).join('');
    const wkList  = (s.weaknesses||[]).map(x => typeof x==='string' ? `<div class="dept-item">• ${x}</div>` : `<div class="dept-item"><b>${x.dept||''}</b>: ${x.detail||''}</div>`).join('');
    const deptRows = (s.department_details||[]).map(d => `<tr><td style="padding:5px 8px">${d.name||''}</td><td style="padding:5px 8px;text-align:center">${d.avg_score??'-'}</td><td style="padding:5px 8px;text-align:center">${d.grade||'-'}</td><td style="padding:5px 8px;text-align:center">${d.completion_rate!=null?d.completion_rate+'%':'-'}</td><td style="padding:5px 8px">${d.strength||''}</td><td style="padding:5px 8px">${d.improvement||''}</td></tr>`).join('');
    const actList = (s.actions||[]).map(x => typeof x==='string' ? `• ${x}` : `• ${x.action||''} <span style="font-size:11px;color:var(--muted)">[난이도:${x.difficulty||'-'} / ${x.duration||''}]</span>`).join('<br>');
    resEl.innerHTML = `<div style="line-height:1.8">
      <div class="ai-section"><b>📊 전체 요약</b><br>${s.overall||''}</div>
      ${strList ? `<div class="ai-section"><b>💪 강점 부서</b>${strList}</div>` : ''}
      ${wkList  ? `<div class="ai-section"><b>⚠️ 약점 부서</b>${wkList}</div>` : ''}
      ${deptRows ? `<div class="ai-section"><b>📋 부서별 상세</b><div style="overflow-x:auto;margin-top:6px"><table class="dept-detail-table"><thead><tr><th>부서</th><th>평균</th><th>등급</th><th>완료율</th><th>강점</th><th>개선점</th></tr></thead><tbody>${deptRows}</tbody></table></div></div>` : ''}
      <div class="ai-section"><b>📈 트렌드</b><br>${s.trend||''}</div>
      ${actList ? `<div class="ai-section"><b>🎯 액션 아이템</b><br>${actList}</div>` : ''}
      ${footer}</div>`;
  } else {
    const strList = (s.strengths||[]).map(x => typeof x==='string' ? `<div class="dept-item">• ${x}</div>` : `<div class="dept-item"><b>${x.dept||''}</b>: ${x.detail||''} ${x.quantitative?'<span style="font-size:11px;color:var(--muted)">('+x.quantitative+')</span>':''}</div>`).join('');
    const wkList  = (s.weaknesses||[]).map(x => typeof x==='string' ? `<div class="dept-item">• ${x}</div>` : `<div class="dept-item"><b>${x.dept||''}</b>: ${x.detail||''} ${x.concern_scope?'<span style="font-size:11px;color:#E53935">[범위: '+x.concern_scope+']</span>':''}</div>`).join('');
    const deptRows = (s.department_details||[]).map(d => `<tr><td style="padding:5px 8px">${d.name||''}</td><td style="padding:5px 8px;text-align:center">${d.avg_score??'-'}</td><td style="padding:5px 8px;text-align:center">${d.grade||'-'}</td><td style="padding:5px 8px;text-align:center">${d.completion_rate!=null?d.completion_rate+'%':'-'}</td><td style="padding:5px 8px">${d.strength||''}</td><td style="padding:5px 8px">${d.improvement||''}</td><td style="padding:5px 8px">${d.trend||''}</td></tr>`).join('');
    const riskList = (s.risks||[]).map(x=>'• '+x).join('<br>');
    const recList  = (s.long_term_recommendations||[]).map(x=>'• '+x).join('<br>');
    const actList  = (s.actions||[]).map(x => typeof x==='string' ? `• ${x}` : `• [${x.priority||''}] ${x.action||''} <span style="font-size:11px;color:var(--muted)">[${x.difficulty||''}/${x.duration||''}, 기대효과: ${x.expected_effect||''}]</span>`).join('<br>');
    resEl.innerHTML = `<div style="line-height:1.8">
      <div class="ai-section"><b>📊 전체 요약</b><br>${s.overall||''}</div>
      ${strList ? `<div class="ai-section"><b>💪 강점 부서</b>${strList}</div>` : ''}
      ${wkList  ? `<div class="ai-section"><b>⚠️ 약점 부서</b>${wkList}</div>` : ''}
      ${deptRows ? `<div class="ai-section"><b>📋 부서별 상세</b><div style="overflow-x:auto;margin-top:6px"><table class="dept-detail-table"><thead><tr><th>부서</th><th>평균</th><th>등급</th><th>완료율</th><th>강점</th><th>개선점</th><th>트렌드</th></tr></thead><tbody>${deptRows}</tbody></table></div></div>` : ''}
      <div class="ai-section"><b>📈 분기별 트렌드</b><br>${s.trend||''}</div>
      ${riskList ? `<div class="ai-section"><b>🚨 위험 요소</b><br>${riskList}</div>` : ''}
      ${s.forecast ? `<div class="ai-section"><b>🔭 향후 전망</b><br>${s.forecast}</div>` : ''}
      ${s.comparison ? `<div class="ai-section"><b>🔀 부서간 비교</b><br>${s.comparison}</div>` : ''}
      ${recList ? `<div class="ai-section"><b>📌 장기 권고사항</b><br>${recList}</div>` : ''}
      ${actList ? `<div class="ai-section"><b>🎯 액션 아이템</b><br>${actList}</div>` : ''}
      ${footer}</div>`;
  }
}

async function submitPasswordChange() {
  const current = document.getElementById('pw-current').value;
  const newPw   = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  const errEl   = document.getElementById('pw-error');

  errEl.style.display = 'none';

  if (!current || !newPw || !confirm) {
    errEl.textContent = '모든 필드를 입력해주세요.';
    errEl.style.display = 'block';
    return;
  }
  if (newPw !== confirm) {
    errEl.textContent = '새 비밀번호와 확인이 일치하지 않습니다.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.querySelector('#pw-change-modal button:last-child');
  if (btn) { btn.disabled = true; btn.textContent = '변경 중...'; }

  try {
    const result = await API.post('/auth/change-password', {
      current_password: current,
      new_password: newPw,
      new_password_confirm: confirm,
    });
    closePasswordChangeModal();
    alert(result.message || '비밀번호가 변경되었습니다. 다시 로그인해주세요.');
    API.clearToken();
    sessionStorage.removeItem('synap_token');
    localStorage.removeItem('synap_token');
    localStorage.removeItem('synap_expire');
    App.user = null;
    location.reload();
  } catch (err) {
    errEl.textContent = err.message || '비밀번호 변경에 실패했습니다.';
    errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = '변경하기'; }
  }
}

/* ── 분석 환산 옵션 (63D) ── */
function convertGradeClient(score, criteria) {
  if (score == null || isNaN(score) || !criteria || !criteria.length) return null;
  for (const c of criteria) {
    if (score >= c.min_score) return c.grade_code;
  }
  return null;
}

function onConvToggle() {
  const enabled = document.getElementById('convToggle')?.checked;
  const selectArea = document.getElementById('convPolicySelect');
  if (selectArea) selectArea.style.display = enabled ? 'flex' : 'none';
  refreshConvTable();
}

function refreshConvTable() {
  const enabled = document.getElementById('convToggle')?.checked;
  const convPolicyId = enabled ? parseInt(document.getElementById('convPolicyId')?.value) : null;
  const data = window._empGradeData;
  if (!data) return;

  const existing = document.getElementById('conv-table-card');
  if (!enabled) {
    if (existing) existing.remove();
    return;
  }

  const criteria = convPolicyId ? (window._policyCache || {})[convPolicyId] : null;
  const policyName = convPolicyId
    ? data.available_policies.find(p => p.id === convPolicyId)?.name || ''
    : '';

  const rows = data.rows;
  if (!rows || !rows.length) return;

  const tableRows = rows.map(row => {
    const storedGrade = row.final_grade || '—';
    let displayCell;
    if (criteria) {
      const convGrade = convertGradeClient(row.final_score, criteria);
      if (convGrade && convGrade !== storedGrade) {
        displayCell = `<span style="color:var(--muted);text-decoration:line-through;font-size:12px">${storedGrade}</span><span style="margin:0 4px">→</span><strong style="color:var(--o500)">${convGrade}</strong>`;
      } else {
        displayCell = `<strong>${convGrade || storedGrade}</strong>`;
      }
    } else {
      displayCell = `<strong>${storedGrade}</strong><span style="font-size:10px;color:var(--muted);margin-left:4px">(${escapeHtml(row.stored_policy_name||'정책없음')})</span>`;
    }
    return `<tr>
      <td style="padding:6px 8px">${escapeHtml(row.employee_name)}</td>
      <td style="padding:6px 8px;color:var(--muted);font-size:12px">${escapeHtml(row.dept||'')}</td>
      <td style="padding:6px 8px;font-size:12px">${escapeHtml(row.period_label)}</td>
      <td style="padding:6px 8px;font-weight:600;color:var(--o600)">${row.final_score != null ? (+row.final_score).toFixed(1) : '—'}</td>
      <td style="padding:6px 8px">${displayCell}</td>
    </tr>`;
  }).join('');

  const html = `
    <div class="card" id="conv-table-card" style="margin-top:12px;overflow-x:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <div style="font-size:13px;font-weight:600;color:var(--o800)">🔄 직원별 등급 환산 현황</div>
        <div style="font-size:11px;color:var(--muted)">환산 기준: <strong>${escapeHtml(policyName)}</strong> · 저장값과 차이 있으면 <span style="color:var(--o500)">주황색</span> 표시</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:2px solid var(--o200)">
            <th style="text-align:left;padding:6px 8px;color:var(--muted)">직원</th>
            <th style="text-align:left;padding:6px 8px;color:var(--muted)">부서</th>
            <th style="text-align:left;padding:6px 8px;color:var(--muted)">기간</th>
            <th style="text-align:left;padding:6px 8px;color:var(--muted)">점수</th>
            <th style="text-align:left;padding:6px 8px;color:var(--muted)">등급</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  const resEl = document.getElementById('org-analysis-result');
  if (existing) {
    existing.outerHTML = html;
  } else if (resEl) {
    resEl.insertAdjacentHTML('beforeend', html);
  }
}
