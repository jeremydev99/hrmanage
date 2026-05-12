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
      <div class="nav-tabs-wrap">
        <nav class="nav-tabs" id="nav-tabs"></nav>
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

    const tabs = [
      { id:'my-eval',   label:'내 평가' },
      { id:'approvals', label:'승인 관리' },
      { id:'progress',  label:'중간 보고' },
      { id:'feedback',  label:'중간 피드백' },
      { id:'final',     label:'최종 평가' },
    ];
    if (this.isAdmin()) tabs.push({ id:'admin', label:'관리자 설정' });

    const nav = document.getElementById('nav-tabs');
    nav.innerHTML = tabs.map(t =>
      `<button class="ntb" id="ntb-${t.id}" onclick="App.navigate('${t.id}')">${t.label}</button>`
    ).join('');
  },

  navigate(page) {
    closeMobileMenu();
    document.querySelectorAll('.ntb').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('ntb-'+page);
    if (btn) btn.classList.add('active');
    const area = document.getElementById('main-area');
    area.innerHTML = '<div class="spinner">로딩 중...</div>';
    const P = {
      'my-eval':   Pages.myEval,
      'approvals': Pages.approvals,
      'progress':  Pages.progressReport,
      'feedback':  Pages.feedback,
      'final':     Pages.finalEval,
      'admin':     Pages.admin,
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
      items: [
        { label: '승인 관리',   tab: 'approvals' },
        { label: '중간 보고',   tab: 'progress'  },
        { label: '중간 피드백', tab: 'feedback'  },
        { label: '최종 평가',   tab: 'final'     },
      ]
    },
  ];

  if (isAdmin) {
    menuGroups.push({
      label: '관리자 설정',
      icon: '⚙',
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
      if (group.label === '내 평가') App.navigate('my-eval');
      else if (group.label === '관리자 설정') App.navigate('admin');
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
        if (item.tab.startsWith('adm-')) {
          App.navigate('admin');
          setTimeout(() => switchAdmTab(item.tab), 300);
        } else {
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
