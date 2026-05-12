/* ── 앱 메인 라우터 ── */
const App = {
  user: null,
  categories: [],

  async init() {
    const token = API.token();
    if (token) {
      try {
        this.user = await API.get('/auth/me');
        this.categories = await API.get('/categories');
        this.render();
        this.navigate('my-eval');
      } catch { this.renderLogin(); }
    } else { this.renderLogin(); }
  },

  renderLogin() { document.getElementById('app').innerHTML = ''; Pages.login(); },

  async login(email, pw) {
    const data = await API.post('/auth/login', { email, password: pw });
    API.setToken(data.token);
    this.user = data.user;
    this.categories = await API.get('/categories');
    this.render();
    this.navigate('my-eval');
  },

  logout() {
    API.clearToken();
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
      <div class="nav-tabs-wrap" style="display:flex;align-items:center;gap:4px;padding:0 8px">

        <!-- 내 평가 드롭다운 -->
        <div class="nav-dropdown" style="position:relative">
          <button class="nav-tab nav-dropdown-btn" onclick="toggleNavDropdown('dd-myeval')"
            style="display:flex;align-items:center;gap:4px">
            내 평가 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
          </button>
          <div id="dd-myeval" class="nav-dropdown-menu" style="display:none;position:absolute;
            top:100%;left:0;background:white;border-radius:8px;min-width:140px;
            box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:200;overflow:hidden;
            border:1px solid var(--o100)">
            <div class="dd-item dd-header" onclick="closeNavDropdown();App.navigate('my-eval')"
              style="padding:10px 16px;font-size:13px;font-weight:600;color:var(--o700);
                     cursor:pointer;border-bottom:1px solid var(--o100);background:var(--o50)">
              📋 내 평가 홈
            </div>
            <div class="dd-item" onclick="closeNavDropdown();App.navigate('approvals')"
              style="padding:10px 16px;font-size:13px;color:var(--o700);cursor:pointer;
                     border-bottom:1px solid var(--o50)">승인 관리</div>
            <div class="dd-item" onclick="closeNavDropdown();App.navigate('final')"
              style="padding:10px 16px;font-size:13px;color:var(--o700);cursor:pointer">최종 평가</div>
          </div>
        </div>

        <!-- 성과관리 드롭다운 -->
        <div class="nav-dropdown" style="position:relative">
          <button class="nav-tab nav-dropdown-btn" onclick="toggleNavDropdown('dd-performance')"
            style="display:flex;align-items:center;gap:4px">
            성과관리 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
          </button>
          <div id="dd-performance" class="nav-dropdown-menu" style="display:none;position:absolute;
            top:100%;left:0;background:white;border-radius:8px;min-width:140px;
            box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:200;overflow:hidden;
            border:1px solid var(--o100)">
            <div class="dd-item" onclick="closeNavDropdown();App.navigate('progress')"
              style="padding:10px 16px;font-size:13px;color:var(--o700);cursor:pointer;
                     border-bottom:1px solid var(--o50)">중간 보고</div>
            <div class="dd-item" onclick="closeNavDropdown();App.navigate('feedback')"
              style="padding:10px 16px;font-size:13px;color:var(--o700);cursor:pointer;
                     border-bottom:1px solid var(--o50)">중간 피드백</div>
            <div class="dd-item" onclick="closeNavDropdown();App.navigate('okrDashboard')"
              style="padding:10px 16px;font-size:13px;color:var(--o700);cursor:pointer">
              🎯 OKR 현황</div>
          </div>
        </div>

        <!-- 관리자 설정 드롭다운 (admin+ 만 표시) -->
        <div class="nav-dropdown admin-only" style="position:relative;display:none">
          <button class="nav-tab nav-dropdown-btn" onclick="toggleNavDropdown('dd-admin')"
            style="display:flex;align-items:center;gap:4px">
            관리자 설정 <span class="dd-arrow" style="font-size:10px;transition:transform .15s">▼</span>
          </button>
          <div id="dd-admin" class="nav-dropdown-menu" style="display:none;position:absolute;
            top:100%;right:0;background:white;border-radius:8px;min-width:160px;
            box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:200;overflow:hidden;
            border:1px solid var(--o100)">
            <div class="dd-item dd-header"
              style="padding:8px 16px;font-size:11px;color:var(--muted);
                     background:var(--o50);border-bottom:1px solid var(--o100)">관리자 메뉴</div>
            <div class="dd-item" onclick="closeNavDropdown();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-accounts'),300)"
              style="padding:10px 16px;font-size:13px;color:var(--o700);cursor:pointer;border-bottom:1px solid var(--o50)">계정 승인 관리</div>
            <div class="dd-item" onclick="closeNavDropdown();App.navigate('admin');setTimeout(()=>switchAdmTab('adm-status'),300)"
              style="padding:10px 16px;font-size:13px;color:var(--o700);cursor:pointer;border-bottom:1px solid var(--o50)">전직원 평가 현황</div>
            <div class="dd-item" onclick="closeNavDropdown();App.navigate('admin')"
              style="padding:10px 16px;font-size:13px;color:var(--o700);cursor:pointer">관리자 설정 전체</div>
          </div>
        </div>

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
    closeNavDropdown();
    const area = document.getElementById('main-area');
    area.innerHTML = '<div class="spinner">로딩 중...</div>';
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
    };
    if (P[page]) P[page]();
    else area.innerHTML = '';
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
        { label: '승인 관리', navigate: 'approvals' },
        { label: '최종 평가', navigate: 'final'     },
      ]
    },
    {
      label: '성과관리',
      icon: '📊',
      navigate: null,
      items: [
        { label: '중간 보고',   navigate: 'progress'      },
        { label: '중간 피드백', navigate: 'feedback'      },
        { label: '🎯 OKR 현황', navigate: 'okrDashboard'  },
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
function toggleNavDropdown(id) {
  const menus  = document.querySelectorAll('.nav-dropdown-menu');
  const arrows = document.querySelectorAll('.dd-arrow');
  const target = document.getElementById(id);
  const isOpen = target?.style.display === 'block';

  menus.forEach(m => m.style.display = 'none');
  arrows.forEach(a => a.style.transform = '');

  if (!isOpen && target) {
    target.style.display = 'block';
    const btn   = target.previousElementSibling;
    const arrow = btn?.querySelector('.dd-arrow');
    if (arrow) arrow.style.transform = 'rotate(180deg)';
    setTimeout(() => {
      document.addEventListener('click', closeNavDropdownOnOutside, { once: true });
    }, 100);
  }
}

function closeNavDropdown() {
  document.querySelectorAll('.nav-dropdown-menu').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.dd-arrow').forEach(a => a.style.transform = '');
}

function closeNavDropdownOnOutside(e) {
  if (!e.target.closest('.nav-dropdown')) closeNavDropdown();
}

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
    header.style.cssText = 'margin-bottom:16px';
    header.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:var(--o800)">🎯 OKR 현황</div>
      <div style="font-size:12px;color:var(--muted)">전체 기간 OKR 달성률 조회</div>`;
    area.appendChild(header);

    if (!cycles.length) {
      area.innerHTML += '<div class="card"><div class="alert alert-orange">작성된 OKR이 없습니다. 내 평가 탭에서 OKR을 작성해주세요.</div></div>';
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
