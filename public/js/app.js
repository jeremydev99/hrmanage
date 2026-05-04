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
      <div class="topbar">
        <div class="topbar-logo">
          ㈜사이냅소프트 <span>인사평가 시스템</span>
        </div>
        <div class="topbar-user">
          <div id="nav-user-name" style="font-size:13px"></div>
          <button onclick="App.logout()">로그아웃</button>
        </div>
      </div>
      <nav class="nav-tabs" id="nav-tabs"></nav>
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
