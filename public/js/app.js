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
          <button onclick="App.logout()">로그아웃</button>
        </div>
        <!-- 우측: 모바일 로그아웃 -->
        <div class="mobile-only" style="flex-shrink:0">
          <button class="btn btn-ghost btn-sm"
            style="color:white;border-color:rgba(255,255,255,.4);white-space:nowrap;font-size:13px"
            onclick="App.logout()">로그아웃</button>
        </div>
      </div>
      <nav class="nav-tabs-wrap" style="display:flex;align-items:center;gap:2px;padding:0 8px">

        <!-- 내 평가 -->
        <div class="nav-dropdown" style="position:relative">
          <button class="nav-tab nav-dd-btn" onclick="toggleNavDD('dd-myeval',event)"
            style="display:flex;align-items:center;gap:4px">
            내 평가 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
          </button>
          <div id="dd-myeval" class="nav-dd-menu">
            <div class="dd-item" onclick="closeNavDD();App.navigate('myEval')">📋 내 평가 홈</div>
            <div class="dd-item" onclick="closeNavDD();App.navigate('approvals')">승인 관리</div>
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
            <div class="dd-item" onclick="closeNavDD();App.navigate('progressReport')">중간 보고</div>
            <div class="dd-item" onclick="closeNavDD();App.navigate('feedback')">중간 피드백</div>
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
            <div class="dd-section-label">관리자 메뉴</div>
            <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-accounts'),300)">계정 승인 관리</div>
            <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-status'),300)">전직원 평가 현황</div>
            <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-periods'),300)">평가 기간 관리</div>
            <div class="dd-item" onclick="closeNavDD();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-policy'),300)">평가 정책</div>
            <div class="dd-item" onclick="closeNavDD();App.navigate('admin')">관리자 설정 전체</div>
          </div>
        </div>

      </nav>
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
    const P = {
      'my-eval':        Pages.myEval,
      'myEval':         Pages.myEval,
      'approvals':      Pages.approvals,
      'progress':       Pages.progressReport,
      'progressReport': Pages.progressReport,
      'feedback':       Pages.feedback,
      'final':          Pages.finalEval,
      'finalEval':      Pages.finalEval,
      'admin':          Pages.admin,
      'okrDashboard':   Pages.okrDashboard,
      'perfHome':       Pages.perfHome,
    };
    if (P[page]) P[page]();
    else { console.warn('[navigate] 미등록 페이지:', page); area.innerHTML = ''; }
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
        { label: '승인 관리',   navigate: 'approvals' },
        { label: '최종 평가',   navigate: 'final'     },
      ]
    },
    {
      label: '성과관리',
      icon: '📊',
      navigate: 'perfHome',
      items: [
        { label: '성과관리 홈', navigate: 'perfHome'     },
        { label: '중간 보고',   navigate: 'progress'     },
        { label: '중간 피드백', navigate: 'feedback'     },
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
      subMenu.style.display = isOpen ? 'none' : 'block';
      const arrow = groupToggle.querySelector(`.menu-arrow-${gi}`);
      if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
    };

    groupHeader.appendChild(groupLabel);
    groupHeader.appendChild(groupToggle);
    groupDiv.appendChild(groupHeader);
    groupDiv.appendChild(subMenu);
    menu.appendChild(groupDiv);
  });

  const logoutBtn = document.createElement('div');
  logoutBtn.style.cssText = 'padding:14px 16px;font-size:14px;color:#E53935;cursor:pointer;border-top:2px solid var(--o100);display:flex;align-items:center;gap:8px';
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
    }, 50);
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

    const [mySummary, teamSummary] = await Promise.all([
      API.get('/perf/my-summary').catch(() => []),
      API.get('/perf/team-summary').catch(() => ({ is_leader: false, teams: [] })),
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
          ${isAdmin ? `<button class="btn btn-ghost btn-sm perf-view-btn" id="view-org" onclick="switchPerfView('org')">전체 조직</button>` : ''}
        </div>
      </div>`;
    area.appendChild(header);

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

    if (isAdmin) {
      const orgView = document.createElement('div');
      orgView.id = 'perf-view-org';
      orgView.style.display = 'none';
      orgView.innerHTML = '<div class="card"><div class="alert alert-teal">🚧 전체 조직 뷰는 준비 중입니다.</div></div>';
      area.appendChild(orgView);
    }

    const aiSection = document.createElement('div');
    aiSection.id = 'ai-summary-section';
    aiSection.className = 'card';
    aiSection.style.marginTop = '12px';
    aiSection.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:14px;font-weight:600">🤖 AI 성과 요약</div>
        <button class="btn btn-ghost btn-sm" onclick="loadAISummary('personal')">요약 생성</button>
      </div>
      <div id="ai-summary-content" style="font-size:13px;color:var(--muted);line-height:1.8">
        '요약 생성' 버튼을 클릭하면 AI가 성과를 분석합니다.
      </div>`;
    area.appendChild(aiSection);

    window._perfData = { mySummary, teamSummary, user };
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

function switchPerfView(view) {
  ['my','team','org'].forEach(v => {
    const el  = document.getElementById('perf-view-'+v);
    const btn = document.getElementById('view-'+v);
    if (el)  el.style.display  = v===view ? 'block' : 'none';
    if (btn) { btn.classList.toggle('btn-primary', v===view); btn.classList.toggle('btn-ghost', v!==view); }
  });
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
      <div style="white-space:pre-wrap;line-height:1.8;color:var(--o800)">${r.summary}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">AI 분석 결과는 참고용입니다. 실제 평가와 다를 수 있습니다.</div>`;
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
